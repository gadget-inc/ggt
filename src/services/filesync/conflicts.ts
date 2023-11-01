import assert from "node:assert";
import { color, printTable, symbol } from "../print.js";
import { Create, Delete, Update } from "./changes.js";
import { type ChangeHash, type ChangesHash } from "./hashes.js";

export class Conflicts extends Map<string, { localChange: ChangeHash; gadgetChange: ChangeHash }> {}

export const getConflicts = ({ localChanges, gadgetChanges }: { localChanges: ChangesHash; gadgetChanges: ChangesHash }): Conflicts => {
  const conflicts = new Conflicts();

  for (const [path, localChange] of localChanges) {
    const gadgetChange = gadgetChanges.get(path);
    if (!gadgetChange) {
      // gadget doesn't have this change, so there's no conflict
      continue;
    }

    if ("targetHash" in localChange && "targetHash" in gadgetChange && localChange.targetHash === gadgetChange.targetHash) {
      // local and gadget both created/updated the same file with the same content
      continue;
    }

    if (localChange instanceof Delete && gadgetChange instanceof Delete) {
      // local and gadget both deleted the same file
      continue;
    }

    conflicts.set(path, { localChange, gadgetChange });
  }

  return conflicts;
};

export const printConflicts = (conflicts: Conflicts): void => {
  const created = color.greenBright("created");
  const updated = color.blueBright("updated");
  const deleted = color.redBright("deleted");

  printTable({
    colAligns: ["left", "left", "center", "center"],
    colWidths: [3],
    chars: { "top-mid": " " },
    head: ["", "", "You", "Gadget"],
    rows: Array.from(conflicts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([path, { localChange, gadgetChange }]) => {
        switch (true) {
          case localChange instanceof Create && gadgetChange instanceof Create:
            return [symbol.plusMinus, path, created, created];
          case localChange instanceof Create && gadgetChange instanceof Update:
            return [symbol.plusMinus, path, created, updated];
          case localChange instanceof Create && gadgetChange instanceof Delete:
            return [symbol.plusMinus, path, created, deleted];
          case localChange instanceof Update && gadgetChange instanceof Create:
            return [symbol.plusMinus, path, updated, created];
          case localChange instanceof Update && gadgetChange instanceof Update:
            return [symbol.plusMinus, path, updated, updated];
          case localChange instanceof Update && gadgetChange instanceof Delete:
            return [symbol.plusMinus, path, updated, deleted];
          case localChange instanceof Delete && gadgetChange instanceof Create:
            return [symbol.plusMinus, path, deleted, created];
          case localChange instanceof Delete && gadgetChange instanceof Update:
            return [symbol.plusMinus, path, deleted, updated];
          default:
            assert(false, `unexpected conflict: ${localChange.type} vs ${gadgetChange.type}`);
        }
      }),
  });
};
