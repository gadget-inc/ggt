import chalk from "chalk";
import pluralize from "pluralize";
import type { Context } from "../command/context.js";
import { config } from "../config/config.js";
import { Level } from "../output/log/level.js";
import type { PrintTableOptions } from "../output/log/printer.js";
import { sprint } from "../output/sprint.js";
import { isNever, isString } from "../util/is.js";

export type Create = { type: "create"; oldPath?: string };
export type Update = { type: "update" };
export type Delete = { type: "delete" };
export type Change = Create | Update | Delete;

export class Changes extends Map<string, Change> {
  created(): string[] {
    return Array.from(this.entries())
      .filter(([, change]) => change.type === "create")
      .map(([path]) => path);
  }

  updated(): string[] {
    return Array.from(this.entries())
      .filter(([, change]) => change.type === "update")
      .map(([path]) => path);
  }

  deleted(): string[] {
    return Array.from(this.entries())
      .filter(([, change]) => change.type === "delete")
      .map(([path]) => path);
  }
}

/**
 * Prints the changes to the console.
 *
 * @param ctx - The current context.
 * @param options - The options to use.
 * @param options.changes - The changes to print.
 * @param options.tense - The tense to use for the change type.
 * @param options.limit - The maximum number of changes to print.
 */
export const printChanges = (
  ctx: Context,
  {
    changes,
    tense,
    limit = Infinity,
    ...tableOptions
  }: {
    changes: Changes;
    tense: "past" | "present";
    limit?: number;
  } & Partial<PrintTableOptions>,
): void => {
  if (config.logLevel <= Level.TRACE) {
    // print all changes when tracing
    limit = Infinity;
  }

  const changesToPrint = Array.from(changes.entries()).filter(([path]) => !path.startsWith(".gadget/"));

  const renamed = chalk.yellowBright(tense === "past" ? "renamed" : "rename");
  const renameSymbol = chalk.yellowBright("→");

  const created = chalk.greenBright(tense === "past" ? "created" : "create");
  const createdSymbol = chalk.greenBright("+");

  const updated = chalk.blueBright(tense === "past" ? "updated" : "update");
  const updatedSymbol = chalk.blueBright("±");

  const deleted = chalk.redBright(tense === "past" ? "deleted" : "delete");
  const deletedSymbol = chalk.redBright("-");

  const rows = changesToPrint
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([path, change]) => {
      switch (true) {
        case change.type === "create" && isString(change.oldPath):
          return [" ", renamed, chalk.yellowBright(change.oldPath), renameSymbol, chalk.yellowBright(path)];
        case change.type === "create":
          return [createdSymbol, created, chalk.greenBright(path)];
        case change.type === "update":
          return [updatedSymbol, updated, chalk.blueBright(path)];
        case change.type === "delete":
          return [deletedSymbol, deleted, chalk.redBright(path)];
        default:
          return isNever(change);
      }
    });

  if (changesToPrint.length > limit) {
    rows.push([chalk.gray("…"), sprint`{gray ${changesToPrint.length - limit} more}`, ""]);
  }

  let footer: string | undefined;
  if (changesToPrint.length >= 10) {
    tableOptions.spaceY = 1;

    footer = sprint`${pluralize("change", changesToPrint.length, true)} in total. `;

    const breakdown = [];

    const createdCount = changesToPrint.filter(([, change]) => change.type === "create").length;
    if (createdCount > 0) {
      breakdown.push(sprint`{greenBright ${pluralize("create", createdCount, true)}}`);
    }

    const updatedCount = changesToPrint.filter(([, change]) => change.type === "update").length;
    if (updatedCount > 0) {
      breakdown.push(sprint`{blueBright ${pluralize("update", updatedCount, true)}}`);
    }

    const deletedCount = changesToPrint.filter(([, change]) => change.type === "delete").length;
    if (deletedCount > 0) {
      breakdown.push(sprint`{redBright ${pluralize("delete", deletedCount, true)}}`);
    }

    footer += breakdown.join(", ");
    footer += ".";
  }

  ctx.log.printTable({ rows, footer, ...tableOptions });
};
