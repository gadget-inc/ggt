import { args as rootArgs } from "../../commands/root.js";
import { withAllowArgs } from "../command/allow.js";
import { extractFlags, type FlagDef } from "../command/arg.js";
import { Commands, importCommand } from "../command/command.js";

export type CompletionSubcommandDef = {
  name: string;
  description: string;
  flags: FlagDef[];
};

export type CommandDef = {
  name: string;
  description: string;
  flags: FlagDef[];
  subcommands: CompletionSubcommandDef[];
};

export type CompletionData = {
  rootFlags: FlagDef[];
  commands: CommandDef[];
};

/**
 * Builds the complete completion data by introspecting all commands.
 */
export const getCompletionData = async (): Promise<CompletionData> => {
  const rootFlags = extractFlags(rootArgs).filter((f) => !f.hidden);

  const commands: CommandDef[] = [];

  const modules = await Promise.all(Commands.map((cmd) => importCommand(cmd)));
  for (const [i, cmd] of Commands.entries()) {
    const mod = modules[i];
    if (mod.hidden) {
      continue;
    }
    const mergedArgs = withAllowArgs(mod.args ?? {});
    const flags = extractFlags(mergedArgs).filter((f) => !f.hidden);
    const description = mod.description;
    const subcommands: CompletionSubcommandDef[] = Object.entries("subcommands" in mod && mod.subcommands ? mod.subcommands : {}).map(
      ([name, sub]) => ({
        name,
        description: sub.description,
        flags: extractFlags(sub.args ?? {}).filter((f) => !f.hidden),
      }),
    );

    commands.push({ name: cmd, description, flags, subcommands });
  }

  return { rootFlags, commands };
};
