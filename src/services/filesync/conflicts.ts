import chalk from "chalk";
import type { Context } from "../command/context.js";
import { ChangesWithHash, isEqualHash, type ChangeWithHash } from "./hashes.js";

/**
 * A map of conflicting changes made between the user's local filesystem
 * and Gadget's filesystem where the key is the path of the conflicting
 * file and the value is an object containing the conflicting changes.
 */
export class Conflicts extends Map<string, { localChange: ChangeWithHash; gadgetChange: ChangeWithHash }> {}

/**
 * Returns the conflicting changes between the user's local filesystem
 * and Gadget's filesystem.
 */
export const getConflicts = ({
  localChanges,
  gadgetChanges,
}: {
  localChanges: ChangesWithHash;
  gadgetChanges: ChangesWithHash;
}): Conflicts => {
  const conflicts = new Conflicts();

  for (const [filepath, localChange] of localChanges) {
    const gadgetChange = gadgetChanges.get(filepath);
    if (!gadgetChange) {
      // gadget doesn't have this change, so there's no conflict
      continue;
    }

    if (localChange.type === "delete" && gadgetChange.type === "delete") {
      // local and gadget both deleted the same file
      continue;
    }

    if (
      "targetHash" in localChange &&
      "targetHash" in gadgetChange &&
      isEqualHash(filepath, localChange.targetHash, gadgetChange.targetHash)
    ) {
      // local and gadget both created/updated the same file with the same content
      continue;
    }

    // local and gadget both updated the same file with different
    // content or one updated and the other deleted
    conflicts.set(filepath, { localChange, gadgetChange });
  }

  // ignore .gadget/ file conflicts and always use gadget's version
  // since gadget is the source of truth for .gadget/ files
  for (const filepath of conflicts.keys()) {
    if (filepath.startsWith(".gadget/")) {
      conflicts.delete(filepath);
    }
  }

  return conflicts;
};

/**
 * Returns a new `Changes` object that contains only the changes that do
 * not have conflicts.
 *
 * @param options - The options to use.
 * @param options.conflicts - The conflicts to check against.
 * @param options.changes - The changes to filter.
 * @returns A new {@linkcode Changes} object without conflicts.
 */
export const withoutConflictingChanges = ({ conflicts, changes }: { conflicts: Conflicts; changes: ChangesWithHash }): ChangesWithHash => {
  const changesWithoutConflicts = new ChangesWithHash(changes);

  for (const [filepath] of changesWithoutConflicts) {
    if (conflicts.has(filepath)) {
      changesWithoutConflicts.delete(filepath);
    }
  }

  return changesWithoutConflicts;
};

/**
 * Prints a table of conflicts between local changes and gadget changes.
 *
 * @param ctx - The current context.
 * @param options - The options to use.
 * @param options.message - The message to print above the table.
 * @param options.conflicts - The conflicts to print.
 */
export const printConflicts = (ctx: Context, { message, conflicts }: { message: string; conflicts: Conflicts }): void => {
  const created = chalk.greenBright("+ created");
  const updated = chalk.blueBright("± updated");
  const deleted = chalk.redBright("- deleted");

  ctx.log.printTable({
    message,
    colAligns: ["left", "center", "center"],
    headers: ["", "You", "Gadget"],
    spaceY: 1,
    rows: Array.from(conflicts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([path, { localChange, gadgetChange }]) => {
        switch (true) {
          case localChange.type === "create" && gadgetChange.type === "create":
            return [path, created, created];
          case localChange.type === "create" && gadgetChange.type === "update":
            return [path, created, updated];
          case localChange.type === "create" && gadgetChange.type === "delete":
            return [path, created, deleted];
          case localChange.type === "update" && gadgetChange.type === "create":
            return [path, updated, created];
          case localChange.type === "update" && gadgetChange.type === "update":
            return [path, updated, updated];
          case localChange.type === "update" && gadgetChange.type === "delete":
            return [path, updated, deleted];
          case localChange.type === "delete" && gadgetChange.type === "create":
            return [path, deleted, created];
          case localChange.type === "delete" && gadgetChange.type === "update":
            return [path, deleted, updated];
          default:
            throw new Error(`Unexpected conflict: ${localChange.type} vs ${gadgetChange.type}`);
        }
      }),
  });
};
