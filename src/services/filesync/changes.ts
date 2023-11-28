import chalk from "chalk";
import pluralize from "pluralize";
import { config } from "../config/config.js";
import { Level } from "../output/log/level.js";
import { createLogger } from "../output/log/logger.js";
import { sprint } from "../output/sprint.js";
import { isNever } from "../util/is.js";

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
 * @param mt - The number of empty lines to print before the changes.
 */
export const printChanges = ({
  title,
  changes,
  tense,
  limit = Infinity,
}: {
  title: string;
  changes: Changes;
  tense: "past" | "present";
  limit?: number;
}): void => {
  if (config.logLevel <= Level.DEBUG) {
    // print all changes when debugging
    limit = Infinity;
  }

  let footer: string | undefined;
  if (changes.size > limit) {
    const nChanges = pluralize("change", changes.size, true);
    const nCreates = pluralize("create", changes.created().length, true);
    const nUpdates = pluralize("update", changes.updated().length, true);
    const nDeletes = pluralize("delete", changes.deleted().length, true);

    footer = sprint`
      {gray … ${changes.size - limit} more}

      ${nChanges} in total. {greenBright ${nCreates}}, {blueBright ${nUpdates}}, {redBright ${nDeletes}}
    `;
  }

  const created = chalk.greenBright("+ " + (tense === "past" ? "created" : "create"));
  const updated = chalk.blueBright("± " + (tense === "past" ? "updated" : "update"));
  const deleted = chalk.redBright("- " + (tense === "past" ? "deleted" : "delete"));

  log.printTable({
    message: title,
    rows: Array.from(changes.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([path, change]) => {
        switch (true) {
          case change.type === "create":
            return [chalk.greenBright(path), created];
          case change.type === "update":
            return [chalk.blueBright(path), updated];
          case change.type === "delete":
            return [chalk.redBright(path), deleted];
          default:
            return isNever(change);
        }
      }),
    footer,
  });
};
