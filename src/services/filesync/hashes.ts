import assert from "node:assert";
import { z } from "zod";
import { createLogger } from "../log.js";
import { Create, Delete, Update } from "./changes.js";

const log = createLogger("hashes");

export const Hashes = z.record(z.string());

export type Hashes = z.infer<typeof Hashes>;

export type ChangeHash = CreateHash | UpdateHash | DeleteHash;

export class ChangesHash extends Map<string, ChangeHash> {}

export class CreateHash extends Create {
  constructor(readonly targetHash: string) {
    super();
  }
}

export class UpdateHash extends Update {
  constructor(
    readonly sourceHash: string,
    readonly targetHash: string,
  ) {
    super();
  }
}

export class DeleteHash extends Delete {
  constructor(readonly sourceHash: string) {
    super();
  }
}

/**
 * @returns The changes that were made to `from` to make it match `to`.
 */
export const getChanges = ({ from: source, to: target, ignore }: { from: Hashes; to: Hashes; ignore?: string[] }): ChangesHash => {
  const changes = new ChangesHash();

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
        changes.set(sourcePath, new DeleteHash(sourceHash));
        log.debug("deleted", { sourcePath, sourceHash });
      }
    } else if (targetHash !== sourceHash) {
      // the file or directory exists in target, but has a different
      // hash, so it's been changed
      changes.set(sourcePath, new UpdateHash(sourceHash, targetHash));
    }
  }

  for (const targetPath of targetPaths) {
    if (ignore?.some((ignored) => targetPath.startsWith(ignored))) {
      continue;
    }

    if (!source[targetPath]) {
      // the targetPath doesn't exist in source, so it's been created
      const targetHash = target[targetPath];
      assert(targetHash);
      changes.set(targetPath, new CreateHash(targetHash));
    }
  }

  return changes;
};

/**
 * @returns the changes that need to be made to `to` to make it match `from`.
 */
export const getChangesToMake = ({ from: source, to: target, ignore }: { from: Hashes; to: Hashes; ignore?: string[] }): ChangesHash => {
  const changes = new ChangesHash();
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
        // existing files inside it, therefor create we need to create
        // it
        changes.set(sourcePath, new CreateHash(sourceHash));
      }
    } else if (targetHash !== sourceHash) {
      // the file or directory exists in target, but has a different
      // hash, so it needs to be updated
      changes.set(sourcePath, new UpdateHash(sourceHash, targetHash));
    }
  }

  for (const targetPath of targetPaths) {
    if (!source[targetPath]) {
      if (ignore?.some((ignored) => targetPath.startsWith(ignored))) {
        continue;
      }

      // the targetPath doesn't exist in source, so it needs to be
      // deleted
      const targetHash = target[targetPath];
      assert(targetHash);
      changes.set(targetPath, new DeleteHash(targetHash));
    }
  }

  return changes;
};

/**
 * @returns
 */
export const getNecessaryFileChanges = ({ changes, existing }: { changes: ChangesHash; existing: Hashes }): ChangesHash => {
  const necessaryChanges = new ChangesHash();

  for (const [path, change] of changes) {
    const existingHash = existing[path];
    if (change instanceof Delete && !existingHash) {
      // already deleted
      continue;
    }

    if ((change instanceof Create || change instanceof Update) && change.targetHash === existingHash) {
      // already created or updated
      continue;
    }

    // we need to make this change
    necessaryChanges.set(path, change);
  }

  return necessaryChanges;
};
