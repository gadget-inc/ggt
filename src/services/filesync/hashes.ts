import assert from "node:assert";
import { createLogger } from "../output/log/logger.js";
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
 * If `existing` is provided, only the changes that are necessary to
 * apply to `existing` are returned.
 *
 * If `ignore` is provided, any changes that were made to a path that
 * starts with any of the `ignore` paths are skipped.
 */
export const getChanges = ({
  from: source,
  to: target,
  existing,
  ignore,
}: {
  from: Hashes;
  to: Hashes;
  existing?: Hashes;
  ignore?: string[];
}): ChangesWithHash => {
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
    } else if (!isEqualHash(sourcePath, sourceHash, targetHash)) {
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

  if (!existing) {
    return changes;
  }

  return withoutUnnecessaryChanges({ changes, existing });
};

/**
 * Filters out changes that the existing filesystem already has.
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

    if (change.type !== "delete" && existingHash && isEqualHash(path, change.targetHash, existingHash)) {
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

export const isEqualHash = (_path: string, aHash: Hash, bHash: Hash): boolean => {
  // FIXME: we're running into issues syncing permissions with Gadget
  // so we're temporarily disabling this check until we can figure out
  return aHash.sha1 === bHash.sha1;

  // if (aHash.sha1 !== bHash.sha1) {
  //   // the contents are different
  //   return false;
  // }

  // if (path.endsWith("/")) {
  //   // it's a directory, so we don't care about permissions
  //   return true;
  // }

  // if (isNil(aHash.permissions) || isNil(bHash.permissions)) {
  //   // one of the filesystems doesn't support permissions, so ignore them
  //   return true;
  // }

  // // the contents are the same, and both filesystems support permissions
  // // so ensure the permissions are also the same
  // return aHash.permissions === bHash.permissions;
};

export const isEqualHashes = (a: Hashes, b: Hashes): boolean => {
  for (const [aPath, aHash] of Object.entries(a)) {
    const bHash = b[aPath];
    if (!bHash || !isEqualHash(aPath, aHash, bHash)) {
      log.debug("hashes are not equal", { path: aPath, aHash, bHash });
      return false;
    }
  }

  for (const bPath of Object.keys(b)) {
    if (!a[bPath]) {
      log.debug("hashes are not equal", { path: bPath, aHash: undefined, bHash: b[bPath] });
      return false;
    }
  }

  return true;
};
