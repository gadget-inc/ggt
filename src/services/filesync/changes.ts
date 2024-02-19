import chalk from "chalk";
import assert from "node:assert";
import pluralize from "pluralize";
import type { Context } from "../command/context.js";
import { config } from "../config/config.js";
import { Level } from "../output/log/level.js";
import { printTable, sprint, type PrintOutput, type PrintOutputReturnType, type PrintTableOptions } from "../output/print.js";
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

export type PrintChangesOptions<Output extends PrintOutput = "stdout"> = Partial<PrintTableOptions<Output>> & {
  /**
   * The tense to use for the change type.
   */
  tense: "past" | "present";

  /**
   * Whether to include  `.gadget/` files in the output.
   *
   * @default undefined (true if there are no other changes, false otherwise)
   */
  includeDotGadget?: boolean;

  /**
   * The maximum number of changes to print.
   *
   * @default Infinity
   */
  limit?: number;
};

const renameSymbol = chalk.yellowBright("→");
const createdSymbol = chalk.greenBright("+");
const updatedSymbol = chalk.blueBright("±");
const deletedSymbol = chalk.redBright("-");

/**
 * Prints the changes to the console.
 *
 * @param _ctx - The current context.
 * @see {@linkcode SprintChangesOptions}
 */
export const printChanges = <const Output extends PrintOutput = "stdout">(
  _ctx: Context,
  {
    changes,
    tense,
    includeDotGadget,
    limit = Infinity,
    ...tableOptions
  }: { changes: Changes | ChangesWithHash } & PrintChangesOptions<Output>,
): PrintOutputReturnType<Output> => {
  const renamed = chalk.yellowBright(tense === "past" ? "renamed" : "rename");
  const created = chalk.greenBright(tense === "past" ? "created" : "create");
  const updated = chalk.blueBright(tense === "past" ? "updated" : "update");
  const deleted = chalk.redBright(tense === "past" ? "deleted" : "delete");

  if (config.logLevel <= Level.TRACE) {
    // print all changes when tracing
    limit = Infinity;
  }

  let changesToPrint = Array.from(changes.entries());

  if (includeDotGadget !== false && changesToPrint.every(([filepath]) => filepath.startsWith(".gadget/"))) {
    // all the changes are in `.gadget/`, so include them since there's
    // nothing else to show
    includeDotGadget = true;
  }

  if (!includeDotGadget) {
    changesToPrint = changesToPrint.filter(([filepath]) => !filepath.startsWith(".gadget/"));
  }

  if (changesToPrint.length === 0) {
    assert([undefined, "stdout"].includes(tableOptions.output), "cannot print empty changes to a non-stdout output type");
    return undefined as PrintOutputReturnType<Output>;
  }

  const rows = changesToPrint
    .sort(([filepathA], [filepathB]) => filepathA.localeCompare(filepathB))
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
    rows.push([chalk.gray("…"), sprint`{gray ${changesToPrint.length - limit} more}`, ""]);
  }

  let footer: string | undefined;
  if (changes.size >= 10) {
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

    footer = sprint({ ensureNewLineAbove: true })`
      ${pluralize("change", changesToPrint.length, true)} in total. ${breakdown.join(", ")}.
    `;
  }

  return printTable({ rows, footer, ...tableOptions });
};
