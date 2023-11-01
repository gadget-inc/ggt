import type { FileSyncEncoding } from "../../__generated__/graphql.js";
import { mapRecords } from "../collections.js";
import { PUBLISH_FILE_SYNC_EVENTS_MUTATION, type EditGraphQL } from "../edit-graphql.js";
import { color, printTable, symbol } from "../print.js";

export type Change = Create | Update | Delete;

export class Create {
  type = "create" as const;
  constructor(readonly path: string) {}
}

export class Update {
  type = "update" as const;
  constructor(readonly path: string) {}
}

export class Delete {
  type = "delete" as const;
  constructor(readonly path: string) {}
}

export type File = {
  path: string;
  oldPath?: string;
  mode: number;
  content: string;
  encoding: FileSyncEncoding;
};

export const sendToGadget = async ({
  editGraphQL,
  expectedFilesVersion,
  changed,
  deleted,
}: {
  editGraphQL: EditGraphQL;
  expectedFilesVersion: bigint;
  changed: Iterable<File>;
  deleted: Iterable<string>;
}): Promise<bigint> => {
  const { publishFileSyncEvents } = await editGraphQL.query({
    query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
    variables: {
      input: {
        expectedRemoteFilesVersion: String(expectedFilesVersion),
        changed: Array.from(changed),
        deleted: mapRecords(deleted, "path"),
      },
    },
  });

  // this._state.filesVersion = publishFileSyncEvents.remoteFilesVersion;
  // this._save();

  return BigInt(publishFileSyncEvents.remoteFilesVersion);
};

export const printChanges = ({ changes, tense = "present" }: { changes: Change[]; tense?: "past" | "present" }): void => {
  const created = color.greenBright(tense === "past" ? "created" : "create");
  const updated = color.blueBright(tense === "past" ? "updated" : "update");
  const deleted = color.redBright(tense === "past" ? "deleted" : "delete");

  printTable({
    head: ["", "", ""],
    rows: changes.map((change) => {
      switch (change.type) {
        case "create":
          return [color.greenBright("+"), color.greenBright(change.path), created];
        case "update":
          return [color.blueBright(symbol.plusMinus), color.blueBright(change.path), updated];
        case "delete":
          return [color.redBright("-"), color.redBright(change.path), deleted];
      }
    }),
  });
};
