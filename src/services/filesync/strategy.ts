import { ArgError } from "../command/arg.js";
import type { Context } from "../command/context.js";
import colors from "../output/colors.js";
import { sprint } from "../output/sprint.js";
import { filterByPrefix } from "../util/collection.js";

export const FileSyncStrategy = Object.freeze({
  CANCEL: "cancel",
  MERGE: "merge",
  PUSH: "push",
  PULL: "pull",
});

export type FileSyncStrategy = (typeof FileSyncStrategy)[keyof typeof FileSyncStrategy];

export const MergeConflictPreference = Object.freeze({
  CANCEL: sprint`Cancel (Ctrl+C)`,
  LOCAL: sprint`Keep ${colors.emphasis("local")} conflicting changes`,
  ENVIRONMENT: sprint`Keep ${colors.emphasis("environment")}'s conflicting changes`,
});

export type MergeConflictPreference = (typeof MergeConflictPreference)[keyof typeof MergeConflictPreference];

export const MergeConflictPreferenceValues = ["local", "environment"] as const;

/**
 * Completes the --prefer flag values (static).
 */
export const completePreference = async (_ctx: Context, partial: string, _argv: string[]): Promise<string[]> => {
  return filterByPrefix([...MergeConflictPreferenceValues], partial);
};

export const MergeConflictPreferenceArg = (value: string, name: string): MergeConflictPreference => {
  if ((MergeConflictPreferenceValues as readonly string[]).includes(value)) {
    return MergeConflictPreference[value.toUpperCase() as keyof typeof MergeConflictPreference];
  }

  throw new ArgError(sprint`
      ${name} must be ${MergeConflictPreferenceValues.map((v) => colors.identifier(v)).join(" or ")}

      ${colors.header("EXAMPLES:")}
        ${MergeConflictPreferenceValues.map((v) => `${name}=${v}`).join("\n")}
    `);
};

// export type FileSyncArgs = DevArgs | PushArgs | PullArgs;

// export const getFileSyncStrategy = (ctx: Context<FileSyncArgs>): FileSyncStrategy | undefined => {
//   switch (true) {
//     case ctx.args["--push"]:
//       return FileSyncStrategy.PUSH;
//     case ctx.args["--pull"]:
//       return FileSyncStrategy.PULL;
//     case ctx.args["--merge"]:
//       return FileSyncStrategy.MERGE;
//     default:
//       return undefined;
//   }
// };

// export const validateFileSyncStrategy = (ctx: Context<FileSyncArgs>): void => {
//   const strategies = ["--push", "--pull", "--merge"] as const;
//   for (const strategy of strategies) {
//     if (!ctx.args[strategy]) {
//       continue;
//     }

//     for (const conflicting of strategies.filter((s) => s !== strategy)) {
//       if (ctx.args[conflicting]) {
//         throw new ArgError(sprint`{bold ${strategy}} and {bold ${conflicting}} cannot be used together`);
//       }
//     }
//   }
// };
