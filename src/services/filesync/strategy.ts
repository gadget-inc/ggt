import { ArgError } from "../command/arg.js";
import { sprint } from "../output/sprint.js";

export const FileSyncStrategy = Object.freeze({
  CANCEL: "cancel",
  MERGE: "merge",
  PUSH: "push",
  PULL: "pull",
});

export type FileSyncStrategy = (typeof FileSyncStrategy)[keyof typeof FileSyncStrategy];

export const MergeConflictPreference = Object.freeze({
  CANCEL: sprint`Cancel (Ctrl+C)`,
  LOCAL: sprint`Keep {underline local} conflicting changes`,
  ENVIRONMENT: sprint`Keep {underline environment}'s conflicting changes`,
});

export type MergeConflictPreference = (typeof MergeConflictPreference)[keyof typeof MergeConflictPreference];

export const MergeConflictPreferenceArg = (value: string, name: string): MergeConflictPreference => {
  if (["local", "environment"].includes(value)) {
    return MergeConflictPreference[value.toUpperCase() as keyof typeof MergeConflictPreference];
  }

  if (value === "gadget") {
    // v0.4 (deprecated)
    return MergeConflictPreference.ENVIRONMENT;
  }

  throw new ArgError(sprint`
      ${name} must be {bold local} or {bold environment}

      {bold EXAMPLES:}
        ${name}=local
        ${name}=environment
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
