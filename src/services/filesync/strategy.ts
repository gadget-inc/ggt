import { ArgError } from "../command/arg.js";
import type { Context } from "../command/context.js";
import { sprint } from "../output/sprint.js";
import { type FileSyncArgs } from "./filesync.js";

export const FileSyncStrategy = Object.freeze({
  CANCEL: "Cancel (Ctrl+C)",
  MERGE: "Merge my changes with Gadget's changes",
  PUSH: "Keep my changes and discard Gadget's changes",
  PULL: "Keep Gadget's changes and discard my changes",
});

export type FileSyncStrategy = (typeof FileSyncStrategy)[keyof typeof FileSyncStrategy];

export const MergeConflictPreference = Object.freeze({
  CANCEL: "Cancel (Ctrl+C)",
  LOCAL: "Keep my conflicting changes",
  GADGET: "Keep Gadget's conflicting changes",
});

export type MergeConflictPreference = (typeof MergeConflictPreference)[keyof typeof MergeConflictPreference];

export const MergeConflictPreferenceArg = (value: string, name: string): MergeConflictPreference => {
  if (["local", "gadget"].includes(value)) {
    return MergeConflictPreference[value.toUpperCase() as keyof typeof MergeConflictPreference];
  }

  throw new ArgError(sprint`
      ${name} must be {bold local} or {bold gadget}

      {bold EXAMPLES:}
        ${name} local
        ${name} gadget
    `);
};

export const getFileSyncStrategy = (ctx: Context<FileSyncArgs>): FileSyncStrategy | undefined => {
  switch (true) {
    case ctx.args["--push"]:
      return FileSyncStrategy.PUSH;
    case ctx.args["--pull"]:
      return FileSyncStrategy.PULL;
    case ctx.args["--merge"]:
      return FileSyncStrategy.MERGE;
    default:
      return undefined;
  }
};

export const validateFileSyncStrategy = (ctx: Context<FileSyncArgs>): void => {
  const strategies = ["--push", "--pull", "--merge"] as const;
  for (const strategy of strategies) {
    if (!ctx.args[strategy]) {
      continue;
    }

    for (const conflicting of strategies.filter((s) => s !== strategy)) {
      if (ctx.args[conflicting]) {
        throw new ArgError(sprint`{bold ${strategy}} and {bold ${conflicting}} cannot be used together`);
      }
    }
  }
};
