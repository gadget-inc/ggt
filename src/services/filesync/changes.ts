import chalk from "chalk";
import pluralize from "pluralize";
import type { Context } from "../command/context.js";
import { config } from "../config/config.js";
import { Level } from "../output/log/level.js";
import { println } from "../output/print.js";
import { sprint, sprintln } from "../output/sprint.js";
import { symbol } from "../output/symbols.js";
import { sprintTable, type SprintTableOptions } from "../output/table.js";
import { memo } from "../util/function.js";
import { isNever, isString } from "../util/is.js";
import type { ChangesWithHash } from "./hashes.js";

export type Create = { type: "create"; oldPath?: string };
export type Update = { type: "update" };
export type Delete = { type: "delete" };
export type Change = Create | Update | Delete;

export class Changes extends Map<string, Change> {
  created = memo((): string[] => {
    return Array.from(this.entries())
      .filter(([, change]) => change.type === "create")
      .map(([path]) => path);
  });

  updated = memo((): string[] => {
    return Array.from(this.entries())
      .filter(([, change]) => change.type === "update")
      .map(([path]) => path);
  });

  deleted = memo((): string[] => {
    return Array.from(this.entries())
      .filter(([, change]) => change.type === "delete")
      .map(([path]) => path);
  });
}

export type PrintChangesOptions = Partial<SprintTableOptions> & {
  /**
   * The tense to use for the change type.
   */
  tense: "past" | "present";

  /**
   * The maximum number of changes to print.
   *
   * @default Infinity
   */
  limit?: number;
};

export const createdSymbol = chalk.greenBright("+");
export const updatedSymbol = chalk.blueBright("±");
export const deletedSymbol = chalk.redBright("-");
export const renameSymbol = chalk.yellowBright("→");

/**
 * Prints the changes to the console.
 *
 * @param _ctx - The current context.
 * @see {@linkcode SprintChangesOptions}
 */
export const sprintChanges = (
  _ctx: Context,
  { changes, tense, limit = Infinity, ...tableOptions }: { changes: Changes | ChangesWithHash } & PrintChangesOptions,
): string => {
  if (config.logLevel <= Level.TRACE) {
    // print all changes when tracing
    limit = Infinity;
  }

  const changesToPrint = Array.from(changes.entries()).filter(([filepath]) => !filepath.startsWith(".gadget/"));
  if (changesToPrint.length === 0) {
    return "";
  }

  const renamed = chalk.yellowBright(tense === "past" ? "renamed" : "rename");
  const created = chalk.greenBright(tense === "past" ? "created" : "create");
  const updated = chalk.blueBright(tense === "past" ? "updated" : "update");
  const deleted = chalk.redBright(tense === "past" ? "deleted" : "delete");

  const rows = changesToPrint
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([path, change]) => {
      switch (true) {
        case change.type === "create" && isString(change.oldPath):
          return [renameSymbol, chalk.yellowBright(change.oldPath), renamed, renameSymbol, chalk.yellowBright(path)];
        case change.type === "create":
          return [createdSymbol, chalk.greenBright(path), created];
        case change.type === "update":
          return [updatedSymbol, chalk.blueBright(path), updated];
        case change.type === "delete":
          return [deletedSymbol, chalk.redBright(path), deleted];
        default:
          return isNever(change);
      }
    });

  if (changesToPrint.length > limit) {
    rows.push([chalk.gray(symbol.ellipsis), sprint`{gray ${changesToPrint.length - limit} more}`, ""]);
  }

  let footer: string | undefined;
  if (changesToPrint.length >= 5) {
    const breakdown = [];

    const createdCount = changesToPrint.filter(([, change]) => change.type === "create").length;
    if (createdCount > 0) {
      const created = tense === "past" ? `${createdCount} created` : pluralize("create", createdCount, true);
      breakdown.push(sprint`{greenBright ${created}}`);
    }

    const updatedCount = changesToPrint.filter(([, change]) => change.type === "update").length;
    if (updatedCount > 0) {
      const updated = tense === "past" ? `${updatedCount} updated` : pluralize("update", updatedCount, true);
      breakdown.push(sprint`{blueBright ${updated}}`);
    }

    const deletedCount = changesToPrint.filter(([, change]) => change.type === "delete").length;
    if (deletedCount > 0) {
      const deleted = tense === "past" ? `${deletedCount} deleted` : pluralize("delete", deletedCount, true);
      breakdown.push(sprint`{redBright ${deleted}}`);
    }

    footer = sprintln`
      ${pluralize("change", changesToPrint.length, true)} in total. ${breakdown.join(", ")}.
    `;
  }

  return sprintTable({
    rows,
    footer,
    ensureEmptyLineAbove: true,
    ensureEmptyLineAboveBody: false,
    ensureEmptyLineAboveFooter: true,
    indent: 0,
    ...tableOptions,
  });
};

/**
 * Prints the changes to the console.
 *
 * @param _ctx - The current context.
 * @see {@linkcode SprintChangesOptions}
 */
export const printChanges = (_ctx: Context, options: { changes: Changes | ChangesWithHash } & PrintChangesOptions): void => {
  const text = sprintChanges(_ctx, options);

  // if all the changes were in the .gadget/ directory then
  // sprintChanges will return an empty string. in that case we don't
  // want to print anything
  if (text) {
    println(text);
  }
};
