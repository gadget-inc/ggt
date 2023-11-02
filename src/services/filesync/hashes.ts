import assert from "node:assert";
import { z } from "zod";
import { createLogger } from "../log.js";
import { Changes, Create, Delete, Update } from "./changes.js";

const log = createLogger("hashes");

export const Hashes = z.record(z.string());
export type Hashes = z.infer<typeof Hashes>;

export type ChangeWithHash = CreateWithHash | UpdateWithHash | DeleteWithHash;

export class ChangesWithHash extends Changes<ChangeWithHash> {}

export class CreateWithHash extends Create {
  constructor(
    readonly targetHash: string,
    oldPath?: string,
  ) {
    super(oldPath);
  }
}

export class UpdateWithHash extends Update {
  constructor(
    readonly sourceHash: string,
    readonly targetHash: string,
  ) {
    super();
  }
}

export class DeleteWithHash extends Delete {
  constructor(readonly sourceHash: string) {
    super();
  }
}

/**
 * @returns The changes that were made to `from` to make it match `to`.
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
        changes.set(sourcePath, new DeleteWithHash(sourceHash));
        log.debug("deleted", { sourcePath, sourceHash });
      }
    } else if (targetHash !== sourceHash) {
      // the file or directory exists in target, but has a different
      // hash, so it's been changed
      changes.set(sourcePath, new UpdateWithHash(sourceHash, targetHash));
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
      changes.set(targetPath, new CreateWithHash(targetHash));
    }
  }

  return changes;
};

/**
 * @returns the changes that need to be made to `to` to make it match `from`.
 */
export const getChangesToMake = ({
  from: source,
  to: target,
  ignore,
}: {
  from: Hashes;
  to: Hashes;
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
        // existing files inside it, therefor create we need to create
        // it
        changes.set(sourcePath, new CreateWithHash(sourceHash));
      }
    } else if (targetHash !== sourceHash) {
      // the file or directory exists in target, but has a different
      // hash, so it needs to be updated
      changes.set(sourcePath, new UpdateWithHash(sourceHash, targetHash));
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
      changes.set(targetPath, new DeleteWithHash(targetHash));
    }
  }

  return changes;
};

/**
 * @returns
 */
export const getNecessaryFileChanges = ({ changes, existing }: { changes: ChangesWithHash; existing: Hashes }): ChangesWithHash => {
  const necessaryChanges = new ChangesWithHash();

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
