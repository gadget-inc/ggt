import assert from "node:assert";
import { z } from "zod";
import { FILE_HASHES_QUERY, type EditGraphQL } from "../edit-graphql.js";
import { Create, Delete, Update } from "./changes.js";
import type { ChangeHash, Hashes } from "./hashes.js";

export const Hashes = z.record(z.string());

export type Hashes = z.infer<typeof Hashes>;

export const gadgetFileHashes = async (
  graphql: EditGraphQL,
  filesVersion?: bigint | string,
  ignorePrefixes?: string[],
): Promise<[bigint, Hashes]> => {
  const { fileHashes } = await graphql.query({
    query: FILE_HASHES_QUERY,
    variables: {
      filesVersion: filesVersion?.toString(),
      ignorePrefixes,
    },
  });

  return [BigInt(fileHashes.filesVersion), Hashes.parse(fileHashes.hashes)];
};

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
