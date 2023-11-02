/* eslint-disable @typescript-eslint/no-extraneous-class */
import { color, printTable, symbol } from "../print.js";

export type Change = Create | Update | Delete;

export class Changes extends Map<string, Change> {}

export class Create {
  readonly type = "create";
  constructor(readonly oldPath?: string) {}
}

export class Update {
  readonly type = "update";
}

export class Delete {
  readonly type = "delete";
}

export const printChanges = ({ changes }: { changes: Changes }): void => {
  const created = color.greenBright("created");
  const updated = color.blueBright("updated");
  const deleted = color.redBright("deleted");

  printTable({
    head: ["", "", ""],
    rows: Array.from(changes.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([path, change]) => {
        switch (true) {
          case change instanceof Create:
            return [color.greenBright("+"), color.greenBright(path), created];
          case change instanceof Update:
            return [color.blueBright(symbol.plusMinus), color.blueBright(path), updated];
          case change instanceof Delete:
            return [color.redBright("-"), color.redBright(path), deleted];
          default:
            throw new Error(`Unknown change type: ${change.constructor.name}`);
        }
      }),
  });
};

export const printChangesToMake = ({ changes }: { changes: Changes }): void => {
  const create = color.greenBright("create");
  const update = color.blueBright("update");
  const del = color.redBright("delete");

  printTable({
    head: ["", "", ""],
    rows: Array.from(changes.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([path, change]) => {
        switch (true) {
          case change instanceof Create:
            return [color.greenBright("+"), color.greenBright(path), create];
          case change instanceof Update:
            return [color.blueBright(symbol.plusMinus), color.blueBright(path), update];
          case change instanceof Delete:
            return [color.redBright("-"), color.redBright(path), del];
          default:
            throw new Error(`Unknown change type: ${change.constructor.name}`);
        }
      }),
  });
};
