import type { FileSyncEncoding } from "../../__generated__/graphql.js";
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
