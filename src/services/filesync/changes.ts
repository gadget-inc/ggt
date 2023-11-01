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

export const printChangesToMake = ({ changes }: { changes: Change[] }): void => {
  const create = color.greenBright("create");
  const update = color.blueBright("update");
  const del = color.redBright("delete");

  printTable({
    head: ["", "", ""],
    rows: changes.map((change) => {
      switch (change.type) {
        case "create":
          return [color.greenBright("+"), color.greenBright(change.path), create];
        case "update":
          return [color.blueBright(symbol.plusMinus), color.blueBright(change.path), update];
        case "delete":
          return [color.redBright("-"), color.redBright(change.path), del];
      }
    }),
  });
};

export const printChanges = ({ changes }: { changes: Change[] }): void => {
  const created = color.greenBright("created");
  const updated = color.blueBright("updated");
  const deleted = color.redBright("deleted");

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
