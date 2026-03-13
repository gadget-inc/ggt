import { flags as rootFlagsDef } from "../../commands/root.ts";
import { withAllowFlags } from "../command/allow.ts";
import { Commands, importCommand } from "../command/command.ts";
import { extractFlags, type FlagDef } from "../command/flag.ts";

/**
 * Collects all flag names and aliases for flags that take a value (string or number).
 */
export const valueFlagNames = (...flagSets: FlagDef[][]): string[] => {
  const names: string[] = [];
  for (const flags of flagSets) {
    for (const f of flags) {
      if (f.type === "string" || f.type === "number") {
        names.push(f.name, ...f.aliases);
      }
    }
  }
  return names;
};

export type CompletionSubcommandDef = {
  name: string;
  description: string;
  aliases: string[];
  flags: FlagDef[];
};

export type CommandDef = {
  name: string;
  description: string;
  aliases: string[];
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
  const rootFlags = extractFlags(rootFlagsDef).filter((f) => !f.hidden);

  const commands: CommandDef[] = [];

  const modules = await Promise.all(Commands.map((cmd) => importCommand(cmd)));
  for (const [i, cmd] of Commands.entries()) {
    const mod = modules[i];
    if (mod.hidden) {
      continue;
    }
    const mergedFlagsDef = withAllowFlags(mod.flags ?? {});
    const flags = extractFlags(mergedFlagsDef).filter((f) => !f.hidden);
    const description = mod.description;
    const subcommands: CompletionSubcommandDef[] = Object.entries("subcommands" in mod && mod.subcommands ? mod.subcommands : {}).map(
      ([name, sub]) => ({
        name,
        description: sub.description,
        aliases: (sub as { aliases?: readonly string[] }).aliases?.slice() ?? [],
        flags: extractFlags(sub.flags ?? {}).filter((f) => !f.hidden),
      }),
    );

    commands.push({ name: cmd, description, aliases: (mod as { aliases?: readonly string[] }).aliases?.slice() ?? [], flags, subcommands });
  }

  return { rootFlags, commands };
};
