import { FlagError } from "../command/flag.ts";
import colors from "../output/colors.ts";
import { sprint } from "../output/sprint.ts";

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

export const MergeConflictPreferenceArg = (value: string, name: string): MergeConflictPreference => {
  if ((MergeConflictPreferenceValues as readonly string[]).includes(value)) {
    return MergeConflictPreference[value.toUpperCase() as keyof typeof MergeConflictPreference];
  }

  throw new FlagError(sprint`
      ${name} must be ${MergeConflictPreferenceValues.map((v) => colors.identifier(v)).join(" or ")}

      ${colors.header("EXAMPLES:")}
        ${MergeConflictPreferenceValues.map((v) => `${name}=${v}`).join("\n")}
    `);
};
