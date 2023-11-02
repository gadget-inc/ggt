/* eslint-disable @typescript-eslint/no-extraneous-class */
import pluralize from "pluralize";
import { color, printTable, println, printlns, symbol } from "../print.js";

export type Change = Create | Update | Delete;

export class Changes<C extends Change = Change> extends Map<string, C> {
  get created(): string[] {
    return Array.from(this.entries())
      .filter(([, change]) => change instanceof Create)
      .map(([path]) => path);
  }

  get updated(): string[] {
    return Array.from(this.entries())
      .filter(([, change]) => change instanceof Update)
      .map(([path]) => path);
  }

  get deleted(): string[] {
    return Array.from(this.entries())
      .filter(([, change]) => change instanceof Delete)
      .map(([path]) => path);
  }
}

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

export const printChanges = ({ changes, limit = 10 }: { changes: Changes; limit?: number }): void => {
  const created = color.greenBright("created");
  const updated = color.blueBright("updated");
  const deleted = color.redBright("deleted");

  printTable({
    head: ["", "", ""],
    rows: Array.from(changes.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, limit)
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

  if (changes.size > limit) {
    println`{gray ${symbol.ellipsis}  ${changes.size - limit} more}`;
  }

  const nChanges = pluralize("change", changes.size, true);
  const createdCount = changes.created.length;
  const updatedCount = changes.updated.length;
  const deletedCount = changes.deleted.length;

  printlns`{gray ${nChanges} in total. ${createdCount} ${created}, ${updatedCount} ${updated}, ${deletedCount} ${deleted}.}`;
};

export const printChangesToMake = ({ changes, limit = Infinity }: { changes: Changes; limit?: number }): void => {
  const create = color.greenBright("create");
  const update = color.blueBright("update");
  const del = color.redBright("delete");

  printTable({
    head: ["", "", ""],
    rows: Array.from(changes.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, limit)
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

  if (changes.size > limit) {
    println`{gray … ${changes.size - limit} more}`;
  }

  const nChanges = pluralize("change", changes.size, true);
  const createdCount = changes.created.length;
  const updatedCount = changes.updated.length;
  const deletedCount = changes.deleted.length;

  printlns`{gray ${nChanges} in total. ${createdCount} created, ${updatedCount} updated, ${deletedCount} deleted.}`;
};
