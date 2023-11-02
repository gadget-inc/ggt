import { color, printTable, println } from "../print.js";
import { Changes, Create, Delete, Update } from "./changes.js";
import { ChangesWithHash, type ChangeWithHash } from "./hashes.js";

export class Conflicts extends Map<string, { localChange: ChangeWithHash; gadgetChange: ChangeWithHash }> {
  localChanges(): ChangesWithHash {
    const changes = new ChangesWithHash();
    for (const [path, { localChange }] of this) {
      changes.set(path, localChange);
    }
    return changes;
  }

  gadgetChanges(): ChangesWithHash {
    const changes = new ChangesWithHash();
    for (const [path, { gadgetChange }] of this) {
      changes.set(path, gadgetChange);
    }
    return changes;
  }
}

export const getConflicts = ({
  localChanges,
  gadgetChanges,
}: {
  localChanges: ChangesWithHash;
  gadgetChanges: ChangesWithHash;
}): Conflicts => {
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

export const withoutConflicts = ({ conflicts, changes }: { conflicts: Conflicts; changes: Changes }): Changes => {
  const changesWithoutConflicts = new Changes();
  for (const [path, change] of changes) {
    if (!conflicts.has(path)) {
      changesWithoutConflicts.set(path, change);
    }
  }
  return changesWithoutConflicts;
};

export const printConflicts = ({ conflicts, mt = 1 }: { conflicts: Conflicts; mt?: number }): void => {
  const created = color.greenBright("+ created");
  const updated = color.blueBright("± updated");
  const deleted = color.redBright("- deleted");

  for (let i = 0; i < mt; i++) {
    println("");
  }

  printTable({
    colAligns: ["left", "center", "center"],
    head: ["", "You", "Gadget"],
    rows: Array.from(conflicts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([path, { localChange, gadgetChange }]) => {
        switch (true) {
          case localChange instanceof Create && gadgetChange instanceof Create:
            return [path, created, created];
          case localChange instanceof Create && gadgetChange instanceof Update:
            return [path, created, updated];
          case localChange instanceof Create && gadgetChange instanceof Delete:
            return [path, created, deleted];
          case localChange instanceof Update && gadgetChange instanceof Create:
            return [path, updated, created];
          case localChange instanceof Update && gadgetChange instanceof Update:
            return [path, updated, updated];
          case localChange instanceof Update && gadgetChange instanceof Delete:
            return [path, updated, deleted];
          case localChange instanceof Delete && gadgetChange instanceof Create:
            return [path, deleted, created];
          case localChange instanceof Delete && gadgetChange instanceof Update:
            return [path, deleted, updated];
          default:
            throw new Error(`Unexpected conflict: ${localChange.type} vs ${gadgetChange.type}`);
        }
      }),
  });
};
