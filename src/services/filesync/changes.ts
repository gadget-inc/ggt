import { color, printTable, symbol } from "../print.js";

export type Change = Create | Update | Delete;

export class Create {
  readonly type = "create";
  constructor(readonly path: string) {}
}

export class Update {
  readonly type = "update";
  constructor(readonly path: string) {}
}

export class Delete {
  readonly type = "delete";
  constructor(readonly path: string) {}
}

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
