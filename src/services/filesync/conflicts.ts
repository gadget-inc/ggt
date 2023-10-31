import { color, printTable, symbol } from "../print.js";
import { type ChangeHash } from "./hashes.js";

export type Conflict =
  | LocalAddedGadgetAdded
  | LocalAddedGadgetChanged
  | LocalAddedGadgetDeleted
  | LocalChangedGadgetAdded
  | LocalChangedGadgetChanged
  | LocalChangedGadgetDeleted
  | LocalDeletedGadgetAdded
  | LocalDeletedGadgetChanged;

export class LocalAddedGadgetAdded {
  type = "local_added_gadget_added" as const;
  constructor(readonly path: string) {}
}

export class LocalAddedGadgetChanged {
  type = "local_added_gadget_changed" as const;
  constructor(readonly path: string) {}
}

export class LocalAddedGadgetDeleted {
  type = "local_added_gadget_deleted" as const;
  constructor(readonly path: string) {}
}

export class LocalChangedGadgetAdded {
  type = "local_changed_gadget_added" as const;
  constructor(readonly path: string) {}
}

export class LocalChangedGadgetChanged {
  type = "local_changed_gadget_changed" as const;
  constructor(readonly path: string) {}
}

export class LocalChangedGadgetDeleted {
  type = "local_changed_gadget_deleted" as const;
  constructor(readonly path: string) {}
}

export class LocalDeletedGadgetAdded {
  type = "local_deleted_gadget_added" as const;
  constructor(readonly path: string) {}
}

export class LocalDeletedGadgetChanged {
  type = "local_deleted_gadget_changed" as const;
  constructor(readonly path: string) {}
}

export const getConflicts = ({ localChanges, gadgetChanges }: { localChanges: ChangeHash[]; gadgetChanges: ChangeHash[] }): Conflict[] => {
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
        conflicts.push(new LocalAddedGadgetAdded(localChange.path));
        break;
      case localChange.type === "create" && gadgetChange.type === "update":
        conflicts.push(new LocalAddedGadgetChanged(localChange.path));
        break;
      case localChange.type === "create" && gadgetChange.type === "delete":
        conflicts.push(new LocalAddedGadgetDeleted(localChange.path));
        break;
      case localChange.type === "update" && gadgetChange.type === "create":
        conflicts.push(new LocalChangedGadgetAdded(localChange.path));
        break;
      case localChange.type === "update" && gadgetChange.type === "update":
        conflicts.push(new LocalChangedGadgetChanged(localChange.path));
        break;
      case localChange.type === "update" && gadgetChange.type === "delete":
        conflicts.push(new LocalChangedGadgetDeleted(localChange.path));
        break;
      case localChange.type === "delete" && gadgetChange.type === "create":
        conflicts.push(new LocalDeletedGadgetAdded(localChange.path));
        break;
      case localChange.type === "delete" && gadgetChange.type === "update":
        conflicts.push(new LocalDeletedGadgetChanged(localChange.path));
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
        case "local_added_gadget_added":
          return [symbol.plusMinus, conflict.path, added, added];
        case "local_added_gadget_changed":
          return [symbol.plusMinus, conflict.path, added, changed];
        case "local_added_gadget_deleted":
          return [symbol.plusMinus, conflict.path, added, deleted];
        case "local_changed_gadget_added":
          return [symbol.plusMinus, conflict.path, changed, added];
        case "local_changed_gadget_changed":
          return [symbol.plusMinus, conflict.path, changed, changed];
        case "local_changed_gadget_deleted":
          return [symbol.plusMinus, conflict.path, changed, deleted];
        case "local_deleted_gadget_added":
          return [symbol.plusMinus, conflict.path, deleted, added];
        case "local_deleted_gadget_changed":
          return [symbol.plusMinus, conflict.path, deleted, changed];
      }
    }),
  });
};
