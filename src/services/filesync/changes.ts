import pluralize from "pluralize";

import type { Context } from "../command/context.ts";
import { config } from "../config/config.ts";
import colors from "../output/colors.ts";
import { Level } from "../output/log/level.ts";
import { println } from "../output/print.ts";
import { sprintln } from "../output/sprint.ts";
import { symbol } from "../output/symbols.ts";
import { sprintTable, type SprintTableOptions } from "../output/table.ts";
import { memo } from "../util/function.ts";
import { isNever, isString } from "../util/is.ts";
import type { ChangesWithHash } from "./hashes.ts";

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

export const createdSymbol = colors.created("+");
export const updatedSymbol = colors.updated("±");
export const deletedSymbol = colors.deleted("-");
export const renameSymbol = colors.renamed("→");

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

  const renamed = colors.renamed(tense === "past" ? "renamed" : "rename");
  const created = colors.created(tense === "past" ? "created" : "create");
  const updated = colors.updated(tense === "past" ? "updated" : "update");
  const deleted = colors.deleted(tense === "past" ? "deleted" : "delete");

  const rows = changesToPrint
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([path, change]) => {
      switch (true) {
        case change.type === "create" && isString(change.oldPath):
          return [renameSymbol, colors.renamed(change.oldPath), renamed, renameSymbol, colors.renamed(path)];
        case change.type === "create":
          return [createdSymbol, colors.created(path), created];
        case change.type === "update":
          return [updatedSymbol, colors.updated(path), updated];
        case change.type === "delete":
          return [deletedSymbol, colors.deleted(path), deleted];
        default:
          return isNever(change);
      }
    });

  if (changesToPrint.length > limit) {
    rows.push([colors.subdued(symbol.ellipsis), `${colors.subdued(String(changesToPrint.length - limit) + " more")}`, ""]);
  }

  let footer: string | undefined;
  if (changesToPrint.length >= 5) {
    const breakdown = [];

    const createdCount = changesToPrint.filter(([, change]) => change.type === "create").length;
    if (createdCount > 0) {
      const created = tense === "past" ? `${createdCount} created` : pluralize("create", createdCount, true);
      breakdown.push(colors.created(created));
    }

    const updatedCount = changesToPrint.filter(([, change]) => change.type === "update").length;
    if (updatedCount > 0) {
      const updated = tense === "past" ? `${updatedCount} updated` : pluralize("update", updatedCount, true);
      breakdown.push(colors.updated(updated));
    }

    const deletedCount = changesToPrint.filter(([, change]) => change.type === "delete").length;
    if (deletedCount > 0) {
      const deleted = tense === "past" ? `${deletedCount} deleted` : pluralize("delete", deletedCount, true);
      breakdown.push(colors.deleted(deleted));
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
