import { color, printTable, symbol } from "../print.js";
import { type ChangeHash } from "./hashes.js";

export type Conflict =
  | LocalCreatedGadgetCreated
  | LocalCreatedGadgetUpdated
  | LocalCreatedGadgetDeleted
  | LocalUpdatedGadgetCreated
  | LocalUpdatedGadgetUpdated
  | LocalUpdatedGadgetDeleted
  | LocalDeletedGadgetCreated
  | LocalDeletedGadgetUpdated;

export class LocalCreatedGadgetCreated {
  readonly type = "local_created_gadget_created";
  constructor(readonly path: string) {}
}

export class LocalCreatedGadgetUpdated {
  readonly type = "local_created_gadget_updated";
  constructor(readonly path: string) {}
}

export class LocalCreatedGadgetDeleted {
  readonly type = "local_created_gadget_deleted";
  constructor(readonly path: string) {}
}

export class LocalUpdatedGadgetCreated {
  readonly type = "local_updated_gadget_created";
  constructor(readonly path: string) {}
}

export class LocalUpdatedGadgetUpdated {
  readonly type = "local_updated_gadget_updated";
  constructor(readonly path: string) {}
}

export class LocalUpdatedGadgetDeleted {
  readonly type = "local_updated_gadget_deleted";
  constructor(readonly path: string) {}
}

export class LocalDeletedGadgetCreated {
  readonly type = "local_deleted_gadget_created";
  constructor(readonly path: string) {}
}

export class LocalDeletedGadgetUpdated {
  readonly type = "local_deleted_gadget_updated";
  constructor(readonly path: string) {}
}

export const getConflicts = ({ localChanges, gadgetChanges }: { localChanges: ChangeHash[]; gadgetChanges: ChangeHash[] }): Conflict[] => {
  const conflicts = [];

  for (const localChange of localChanges) {
    const gadgetChange = gadgetChanges.find((gadgetChange) => gadgetChange.path === localChange.path);
    if (!gadgetChange) {
      continue;
    }

    if ("toHash" in localChange && "toHash" in gadgetChange && localChange.targetHash === gadgetChange.targetHash) {
      continue;
    }

    switch (true) {
      case localChange.type === "create" && gadgetChange.type === "create":
        conflicts.push(new LocalCreatedGadgetCreated(localChange.path));
        break;
      case localChange.type === "create" && gadgetChange.type === "update":
        conflicts.push(new LocalCreatedGadgetUpdated(localChange.path));
        break;
      case localChange.type === "create" && gadgetChange.type === "delete":
        conflicts.push(new LocalCreatedGadgetDeleted(localChange.path));
        break;
      case localChange.type === "update" && gadgetChange.type === "create":
        conflicts.push(new LocalUpdatedGadgetCreated(localChange.path));
        break;
      case localChange.type === "update" && gadgetChange.type === "update":
        conflicts.push(new LocalUpdatedGadgetUpdated(localChange.path));
        break;
      case localChange.type === "update" && gadgetChange.type === "delete":
        conflicts.push(new LocalUpdatedGadgetDeleted(localChange.path));
        break;
      case localChange.type === "delete" && gadgetChange.type === "create":
        conflicts.push(new LocalDeletedGadgetCreated(localChange.path));
        break;
      case localChange.type === "delete" && gadgetChange.type === "update":
        conflicts.push(new LocalDeletedGadgetUpdated(localChange.path));
        break;
    }
  }

  return conflicts;
};

export const printConflicts = (conflicts: Conflict[]): void => {
  const created = color.greenBright("created");
  const updated = color.blueBright("updated");
  const deleted = color.redBright("deleted");

  printTable({
    colAligns: ["left", "left", "center", "center"],
    colWidths: [3],
    chars: { "top-mid": " " },
    head: ["", "", "You", "Gadget"],
    rows: conflicts.map((conflict) => {
      switch (conflict.type) {
        case "local_created_gadget_created":
          return [symbol.plusMinus, conflict.path, created, created];
        case "local_created_gadget_updated":
          return [symbol.plusMinus, conflict.path, created, updated];
        case "local_created_gadget_deleted":
          return [symbol.plusMinus, conflict.path, created, deleted];
        case "local_updated_gadget_created":
          return [symbol.plusMinus, conflict.path, updated, created];
        case "local_updated_gadget_updated":
          return [symbol.plusMinus, conflict.path, updated, updated];
        case "local_updated_gadget_deleted":
          return [symbol.plusMinus, conflict.path, updated, deleted];
        case "local_deleted_gadget_created":
          return [symbol.plusMinus, conflict.path, deleted, created];
        case "local_deleted_gadget_updated":
          return [symbol.plusMinus, conflict.path, deleted, updated];
      }
    }),
  });
};
