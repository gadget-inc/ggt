import assert from "node:assert";
import { z } from "zod";
import { createLogger } from "../log.js";
import { Create, Delete, Update } from "./changes.js";

const log = createLogger("hashes");

export const Hashes = z.record(z.string());

export type Hashes = z.infer<typeof Hashes>;

export type ChangeHash = CreateHash | UpdateHash | DeleteHash;

export class CreateHash extends Create {
  constructor(
    path: string,
    readonly targetHash: string,
  ) {
    super(path);
  }
}

export class UpdateHash extends Update {
  constructor(
    path: string,
    readonly sourceHash: string,
    readonly targetHash: string,
  ) {
    super(path);
  }
}

export class DeleteHash extends Delete {
  constructor(
    path: string,
    readonly sourceHash: string,
  ) {
    super(path);
  }
}

/**
 * @returns The changes that were made to `from` to make it match `to`.
 */
export const getChanges = ({ from: source, to: target, ignore }: { from: Hashes; to: Hashes; ignore?: string[] }): ChangeHash[] => {
  const created: CreateHash[] = [];
  const updated: UpdateHash[] = [];
  const deleted: DeleteHash[] = [];

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
        deleted.push(new DeleteHash(sourcePath, sourceHash));
        log.debug("deleted", { sourcePath, sourceHash });
      }
    } else if (targetHash !== sourceHash) {
      // the file or directory exists in target, but has a different
      // hash, so it's been changed
      updated.push(new UpdateHash(sourcePath, sourceHash, targetHash));
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
      created.push(new CreateHash(targetPath, targetHash));
    }
  }

  return [...created, ...updated, ...deleted].sort((a, b) => a.path.localeCompare(b.path));
};

/**
 * @returns the changes that need to be made to `to` to make it match `from`.
 */
export const getChangesToMake = ({ from: source, to: target, ignore }: { from: Hashes; to: Hashes; ignore?: string[] }): ChangeHash[] => {
  const create: CreateHash[] = [];
  const update: UpdateHash[] = [];
  const del: DeleteHash[] = [];

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
        create.push(new CreateHash(sourcePath, sourceHash));
      }
    } else if (targetHash !== sourceHash) {
      // the file or directory exists in target, but has a different
      // hash, so it needs to be updated
      update.push(new UpdateHash(sourcePath, sourceHash, targetHash));
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
      del.push(new DeleteHash(targetPath, targetHash));
    }
  }

  return [...create, ...update, ...del].sort((a, b) => a.path.localeCompare(b.path));
};

/**
 * @returns
 */
export const getNecessaryFileChanges = ({ changes, existing }: { changes: ChangeHash[]; existing: Hashes }): ChangeHash[] => {
  return changes.filter((change) => {
    const existingHash = existing[change.path];
    if (change.type === "delete" && !existingHash) {
      // already deleted
      return false;
    }
    if ((change.type === "create" || change.type === "update") && change.targetHash === existingHash) {
      // already created or updated
      return false;
    }
    return true;
  });
};
