/* eslint-disable @typescript-eslint/no-extraneous-class */
import chalk from "chalk";
import pluralize from "pluralize";
import { printTable, println, printlns, symbol } from "../print.js";

export type Change = Create | Update | Delete;

export class Changes<C extends Change = Change> extends Map<string, C> {
  created(): string[] {
    return Array.from(this.entries())
      .filter(([, change]) => change instanceof Create)
      .map(([path]) => path);
  }

  updated(): string[] {
    return Array.from(this.entries())
      .filter(([, change]) => change instanceof Update)
      .map(([path]) => path);
  }

  deleted(): string[] {
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

export const printChanges = ({ changes, limit = 10, mt = 1 }: { changes: Changes; limit?: number; mt?: number }): void => {
  const created = chalk.greenBright("+ created");
  const updated = chalk.blueBright("± updated");
  const deleted = chalk.redBright("- deleted");

  for (let i = 0; i < mt; i++) {
    println("");
  }

  printTable({
    rows: Array.from(changes.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([path, change]) => {
        switch (true) {
          case change instanceof Create:
            return [chalk.greenBright(path), created];
          case change instanceof Update:
            return [chalk.blueBright(path), updated];
          case change instanceof Delete:
            return [chalk.redBright(path), deleted];
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

export const printChangesToMake = ({ changes, limit = Infinity, mt = 1 }: { changes: Changes; limit?: number; mt?: number }): void => {
  const create = chalk.greenBright("+ create");
  const update = chalk.blueBright("± update");
  const del = chalk.redBright("- delete");

  for (let i = 0; i < mt; i++) {
    println("");
  }

  printTable({
    rows: Array.from(changes.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([path, change]) => {
        switch (true) {
          case change instanceof Create:
            return [chalk.greenBright(path), create];
          case change instanceof Update:
            return [chalk.blueBright(path), update];
          case change instanceof Delete:
            return [chalk.redBright(path), del];
          default:
            throw new Error(`Unknown change type: ${change.constructor.name}`);
        }
      }),
  });

  if (changes.size > limit) {
    println`{gray … ${changes.size - limit} more}`;
  }

  const nChanges = pluralize("change", changes.size, true);
  const createCount = changes.created.length;
  const updateCount = changes.updated.length;
  const deleteCount = changes.deleted.length;

  printlns`{gray ${nChanges} in total. ${createCount} to ${create}, ${updateCount} to ${update}, ${deleteCount} to ${del}.}`;
};
