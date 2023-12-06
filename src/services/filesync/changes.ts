import chalk from "chalk";
import pluralize from "pluralize";
import { config } from "../config/config.js";
import { Level } from "../output/log/level.js";
import { createLogger } from "../output/log/logger.js";
import type { PrintTableOptions } from "../output/log/printer.js";
import { sprint } from "../output/sprint.js";
import { isNever, isString } from "../util/is.js";

const log = createLogger({ name: "changes" });

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
 * @param changes - The changes to print.
 * @param tense - The tense to use for the change type.
 * @param limit - The maximum number of changes to print.
 */
export const printChanges = ({
  changes,
  tense,
  limit = 10,
  ...tableOptions
}: {
  changes: Changes;
  tense: "past" | "present";
  limit?: number;
} & Partial<PrintTableOptions>): void => {
  if (config.logLevel <= Level.TRACE) {
    // print all changes when tracing
    limit = Infinity;
  }

  const renamed = chalk.yellowBright((tense === "past" ? "renamed" : "rename") + " →");
  const created = chalk.greenBright((tense === "past" ? "created" : "create") + " +");
  const updated = chalk.blueBright((tense === "past" ? "updated" : "update") + " ±");
  const deleted = chalk.redBright((tense === "past" ? "deleted" : "delete") + " -");

  const rows = Array.from(changes.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([path, change]) => {
      switch (true) {
        case change.type === "create" && isString(change.oldPath):
          return [chalk.yellowBright(change.oldPath), renamed, chalk.yellowBright(path)];
        case change.type === "create":
          return [chalk.greenBright(path), created];
        case change.type === "update":
          return [chalk.blueBright(path), updated];
        case change.type === "delete":
          return [chalk.redBright(path), deleted];
        default:
          return isNever(change);
      }
    });

  if (changes.size > limit) {
    rows.push([sprint`{gray … ${changes.size - limit} more}`, ""]);
  }

  let footer: string | undefined;
  if (changes.size >= 10) {
    footer = sprint`${pluralize("change", changes.size, true)} in total.`;

    const created = changes.created();
    if (created.length > 0) {
      footer += sprint` {greenBright ${pluralize("create", created.length, true)}}`;
    }

    const updated = changes.updated();
    if (updated.length > 0) {
      footer += sprint` {blueBright ${pluralize("update", updated.length, true)}}`;
    }

    const deleted = changes.deleted();
    if (deleted.length > 0) {
      footer += sprint` {redBright ${pluralize("delete", deleted.length, true)}}`;
    }
  }

  log.printTable({ rows, footer, ...tableOptions });
};
