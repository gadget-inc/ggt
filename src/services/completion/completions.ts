import { args as rootArgs } from "../../commands/root.js";
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
  const rootFlags = extractFlags(rootArgs);

  const commands: CommandDef[] = [];

  for (const cmd of Commands) {
    const mod = await importCommand(cmd);
    if (mod.hidden) {
      continue;
    }
    const flags = extractFlags(mod.args ?? {});
    const description = mod.description ?? "";
    const subcommands: CompletionSubcommandDef[] = (mod.subcommandDefs ?? []).map((sub) => ({
      name: sub.name,
      description: sub.description,
      flags: extractFlags(sub.args ?? {}),
    }));

    commands.push({ name: cmd, description, flags, subcommands });
  }

  return { rootFlags, commands };
};
