import assert from "node:assert";
import { z } from "zod";
import { FILE_HASHES_QUERY } from "../edit-graphql.js";
import { Create, Delete, Update } from "./changes.js";
import { fileHashes, type FileSync } from "./shared.js";

export const Hashes = z.record(z.string());

export type Hashes = z.infer<typeof Hashes>;

export type ChangeHash = CreateHash | UpdateHash | DeleteHash;

export class CreateHash extends Create {
  constructor(
    path: string,
    readonly toHash: string,
  ) {
    super(path);
  }
}

export class UpdateHash extends Update {
  constructor(
    path: string,
    readonly fromHash: string,
    readonly toHash: string,
  ) {
    super(path);
  }
}

export class DeleteHash extends Delete {
  constructor(
    path: string,
    readonly fromHash: string,
  ) {
    super(path);
  }
}

export const getHashes = async ({
  filesync,
}: {
  filesync: FileSync;
}): Promise<{
  /**
   * The latest filesVersion in Gadget.
   */
  gadgetFilesVersion: bigint;
  filesVersionHashes: Hashes;
  localHashes: Hashes;
  gadgetHashes: Hashes;
}> => {
  const [localHashes, filesVersionHashes, { gadgetFilesVersion, gadgetHashes }] = await Promise.all([
    fileHashes(filesync),

    filesync.editGraphQL
      .query({ query: FILE_HASHES_QUERY, variables: { filesVersion: String(filesync.filesVersion) } })
      .then((data) => Hashes.parse(data.fileHashes.hashes)),

    filesync.editGraphQL.query({ query: FILE_HASHES_QUERY }).then((data) => ({
      gadgetFilesVersion: BigInt(data.fileHashes.filesVersion),
      gadgetHashes: Hashes.parse(data.fileHashes.hashes),
    })),
  ]);

  return {
    gadgetFilesVersion,
    filesVersionHashes,
    localHashes,
    gadgetHashes,
  };
};

export const getFileChanges = ({ from, to }: { from: Hashes; to: Hashes }): ChangeHash[] => {
  const added: CreateHash[] = [];
  const changed: UpdateHash[] = [];
  const deleted: DeleteHash[] = [];

  const toPaths = Object.keys(to);

  for (const [fromPath, fromHash] of Object.entries(from)) {
    const toHash = to[fromPath];
    if (!toHash) {
      if (!fromPath.endsWith("/") || !toPaths.some((toPath) => toPath.startsWith(fromPath))) {
        // fromPath is a file and it doesn't exist in to OR fromPath
        // is a directory and to doesn't have any existing files
        // inside it, therefor the fromPath has been deleted
        deleted.push(new DeleteHash(fromPath, fromHash));
      }
    } else if (toHash !== fromHash) {
      // the file or directory exists in to, but has a different
      // hash, so it's been changed
      changed.push(new UpdateHash(fromPath, fromHash, toHash));
    }
  }

  for (const toPath of toPaths) {
    if (!from[toPath]) {
      // the toPath doesn't exist in from, so it's been added
      const toHash = to[toPath];
      assert(toHash);
      added.push(new CreateHash(toPath, toHash));
    }
  }

  return [...added, ...changed, ...deleted].sort((a, b) => a.path.localeCompare(b.path));
};

export const getNecessaryFileChanges = ({ changes, existing }: { changes: ChangeHash[]; existing: Hashes }): ChangeHash[] => {
  return changes.filter((change) => {
    const hash = existing[change.path];
    if (change.type === "delete" && !hash) {
      // already deleted
      return false;
    }
    if ((change.type === "create" || change.type === "update") && change.toHash === hash) {
      // already created or updated
      return false;
    }
    return true;
  });
};
