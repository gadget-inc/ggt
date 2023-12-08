import assert from "node:assert";
import { createLogger } from "../output/log/logger.js";
import { isNil } from "../util/is.js";
import { type Create, type Delete, type Update } from "./changes.js";
import type { Hash, Hashes } from "./directory.js";

const log = createLogger({ name: "hashes" });

export type CreateWithHash = Create & { targetHash: Hash };
export type UpdateWithHash = Update & { sourceHash: Hash; targetHash: Hash };
export type DeleteWithHash = Delete & { sourceHash: Hash };
export type ChangeWithHash = CreateWithHash | UpdateWithHash | DeleteWithHash;

export class ChangesWithHash extends Map<string, ChangeWithHash> {
  created(): string[] {
    return Array.from(this.entries())
      .filter(([, change]) => change.type === "create")
      .map(([path]) => path);
  }

  updated(): string[] {
    return Array.from(this.entries())
      .filter(([, change]) => change.type === "update")
      .map(([path]) => path);
  }

  deleted(): string[] {
    return Array.from(this.entries())
      .filter(([, change]) => change.type === "delete")
      .map(([path]) => path);
  }
}

/**
 * Calculates the changes that were made to `from` to make it end up as `to`.
 *
 * @param from - The source `Hashes` object to compare.
 * @param to - The target `Hashes` object to compare.
 * @param ignore - An optional array of path prefixes to ignore during the comparison.
 */
export const getChanges = ({ from: source, to: target, ignore }: { from: Hashes; to: Hashes; ignore?: string[] }): ChangesWithHash => {
  const changes = new ChangesWithHash();
  const targetPaths = Object.keys(target);

  for (const [sourcePath, sourceHash] of Object.entries(source)) {
    if (ignore?.some((ignored) => sourcePath.startsWith(ignored))) {
      continue;
    }

    const targetHash = target[sourcePath];
    if (!targetHash) {
      if (!sourcePath.endsWith("/") || !targetPaths.some((targetPath) => targetPath.startsWith(sourcePath))) {
        // sourcePath is a file and it doesn't exist in target OR
        // sourcePath is a directory and target doesn't have any
        // existing files inside it, therefor the sourcePath has been
        // deleted
        changes.set(sourcePath, { type: "delete", sourceHash });
        log.trace("file deleted", { path: sourcePath, sourceHash });
      }
    } else if (!isEqualHash(sourceHash, targetHash)) {
      // the file or directory exists in target, but has a different
      // hash, so it's been updated
      changes.set(sourcePath, { type: "update", sourceHash, targetHash });
      log.trace("file updated", { path: sourcePath, sourceHash, targetHash });
    }
  }

  for (const targetPath of targetPaths) {
    if (ignore?.some((ignored) => targetPath.startsWith(ignored))) {
      continue;
    }

    if (!source[targetPath]) {
      // the targetPath doesn't exist in source, so it's been created
      const targetHash = target[targetPath];
      assert(targetHash, "targetHash should exist");

      changes.set(targetPath, { type: "create", targetHash });
      log.trace("file created", { path: targetPath, targetHash });
    }
  }

  return changes;
};

/**
 * Filters out changes that the existing filesystem already has.
 *
 * @param changes - The changes that are going to be applied to `existing`.
 * @param existing - The existing filesystem `Hashes`.
 * @returns Changes that are necessary to apply to `existing`.
 */
export const withoutUnnecessaryChanges = ({ changes, existing }: { changes: ChangesWithHash; existing: Hashes }): ChangesWithHash => {
  const necessaryChanges = new ChangesWithHash();

  for (const [path, change] of changes) {
    const existingHash = existing[path];
    if (change.type === "delete" && !existingHash) {
      // already deleted
      log.trace("already deleted", { path });
      continue;
    }

    if (change.type !== "delete" && existingHash && isEqualHash(change.targetHash, existingHash)) {
      // already created or updated
      log.trace("already created or updated", { path, existingHash, targetHash: change.targetHash });
      continue;
    }

    // we could do this:
    // if (change.type === "update" && !existingHash) {
    //   change = { type: "create", targetHash: change.targetHash };
    // }
    // but, changing the type makes the output look confusing and it
    // doesn't change the outcome, so we just leave it as is

    necessaryChanges.set(path, change);
  }

  return necessaryChanges;
};

export const isEqualHash = (a: Hash, b: Hash): boolean => {
  return a.sha1 === b.sha1 && (isNil(a.permissions) || isNil(b.permissions) || a.permissions === b.permissions);
};

export const isEqualHashes = (a: Hashes, b: Hashes): boolean => {
  for (const [aPath, aHash] of Object.entries(a)) {
    const bHash = b[aPath];
    if (!bHash || !isEqualHash(aHash, bHash)) {
      log.trace("hashes are not equal", { path: aPath, aHash, bHash });
      return false;
    }
  }

  for (const bPath of Object.keys(b)) {
    if (!a[bPath]) {
      log.trace("hashes are not equal", { path: bPath, aHash: undefined, bHash: b[bPath] });
      return false;
    }
  }

  return true;
};
