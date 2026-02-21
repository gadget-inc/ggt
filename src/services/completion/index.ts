export type { FlagDef } from "../command/arg.js";
export { generateBashCompletions } from "./bash.js";
export { getCompletionData } from "./completions.js";
export type { CommandDef, CompletionData, CompletionSubcommandDef } from "./completions.js";
export { generateFishCompletions } from "./fish.js";
export { generateZshCompletions } from "./zsh.js";
