import { color, printTable, symbol } from "../print.js";
import { type ChangeHash } from "./hashes.js";

export type Conflict =
  | YouAddedTheyAdded
  | YouAddedTheyChanged
  | YouAddedTheyDeleted
  | YouChangedTheyAdded
  | YouChangedTheyChanged
  | YouChangedTheyDeleted
  | YouDeletedTheyAdded
  | YouDeletedTheyChanged;

export class YouAddedTheyAdded {
  type = "youAddedTheyAdded" as const;
  constructor(readonly path: string) {}
}

export class YouAddedTheyChanged {
  type = "youAddedTheyChanged" as const;
  constructor(readonly path: string) {}
}

export class YouAddedTheyDeleted {
  type = "youAddedTheyDeleted" as const;
  constructor(readonly path: string) {}
}

export class YouChangedTheyAdded {
  type = "youChangedTheyAdded" as const;
  constructor(readonly path: string) {}
}

export class YouChangedTheyChanged {
  type = "youChangedTheyChanged" as const;
  constructor(readonly path: string) {}
}

export class YouChangedTheyDeleted {
  type = "youChangedTheyDeleted" as const;
  constructor(readonly path: string) {}
}

export class YouDeletedTheyAdded {
  type = "youDeletedTheyAdded" as const;
  constructor(readonly path: string) {}
}

export class YouDeletedTheyChanged {
  type = "youDeletedTheyChanged" as const;
  constructor(readonly path: string) {}
}

export const getFileConflicts = ({
  localChanges,
  gadgetChanges,
}: {
  localChanges: ChangeHash[];
  gadgetChanges: ChangeHash[];
}): Conflict[] => {
  const conflicts = [];

  for (const localChange of localChanges) {
    const gadgetChange = gadgetChanges.find((gadgetChange) => gadgetChange.path === localChange.path);
    if (!gadgetChange) {
      continue;
    }

    if ("toHash" in localChange && "toHash" in gadgetChange && localChange.toHash === gadgetChange.toHash) {
      continue;
    }

    switch (true) {
      case localChange.type === "create" && gadgetChange.type === "create":
        conflicts.push(new YouAddedTheyAdded(localChange.path));
        break;
      case localChange.type === "create" && gadgetChange.type === "update":
        conflicts.push(new YouAddedTheyChanged(localChange.path));
        break;
      case localChange.type === "create" && gadgetChange.type === "delete":
        conflicts.push(new YouAddedTheyDeleted(localChange.path));
        break;
      case localChange.type === "update" && gadgetChange.type === "create":
        conflicts.push(new YouChangedTheyAdded(localChange.path));
        break;
      case localChange.type === "update" && gadgetChange.type === "update":
        conflicts.push(new YouChangedTheyChanged(localChange.path));
        break;
      case localChange.type === "update" && gadgetChange.type === "delete":
        conflicts.push(new YouChangedTheyDeleted(localChange.path));
        break;
      case localChange.type === "delete" && gadgetChange.type === "create":
        conflicts.push(new YouDeletedTheyAdded(localChange.path));
        break;
      case localChange.type === "delete" && gadgetChange.type === "update":
        conflicts.push(new YouDeletedTheyChanged(localChange.path));
        break;
    }
  }

  return conflicts;
};

export const printConflicts = (conflicts: Conflict[]): void => {
  const added = color.greenBright("added");
  const changed = color.blueBright("changed");
  const deleted = color.redBright("deleted");

  printTable({
    colAligns: ["left", "left", "center", "center"],
    colWidths: [4],
    chars: { "top-mid": " " },
    head: ["", "", "You", "Gadget"],
    rows: conflicts.map((conflict) => {
      switch (conflict.type) {
        case "youAddedTheyAdded":
          return [symbol.plusMinus, conflict.path, added, added];
        case "youAddedTheyChanged":
          return [symbol.plusMinus, conflict.path, added, changed];
        case "youAddedTheyDeleted":
          return [symbol.plusMinus, conflict.path, added, deleted];
        case "youChangedTheyAdded":
          return [symbol.plusMinus, conflict.path, changed, added];
        case "youChangedTheyChanged":
          return [symbol.plusMinus, conflict.path, changed, changed];
        case "youChangedTheyDeleted":
          return [symbol.plusMinus, conflict.path, changed, deleted];
        case "youDeletedTheyAdded":
          return [symbol.plusMinus, conflict.path, deleted, added];
        case "youDeletedTheyChanged":
          return [symbol.plusMinus, conflict.path, deleted, changed];
      }
    }),
  });
};
