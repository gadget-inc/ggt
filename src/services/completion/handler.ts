import arg from "arg";

import { args as rootArgs } from "../../commands/root.js";
import { extractFlags, flagWords, aliasName, toEntryArray, type ArgsDefinition } from "../command/arg.js";
import { Commands, importCommand, isCommand } from "../command/command.js";
import type { Context } from "../command/context.js";
import { filterByPrefix } from "../util/collection.js";

/**
 * Handles a `ggt --__complete <tokens...>` request.
 * Parses the tokens, determines completion context, and prints candidates to stdout.
 */
export const handleCompletionRequest = async (ctx: Context, tokens: string[]): Promise<void> => {
  try {
    const candidates = await getCompletionCandidates(ctx, tokens);
    if (candidates.length > 0) {
      process.stdout.write(candidates.join("\n") + "\n");
    }
  } catch {
    // completions must never print errors
  }
};

const getCompletionCandidates = async (ctx: Context, tokens: string[]): Promise<string[]> => {
  const partial = tokens.at(-1) ?? "";
  const preceding = tokens.slice(0, -1);

  // Find command name from preceding tokens, skipping root flag values
  let commandName: string | undefined;
  let commandTokenIndex = -1;
  let skipNext = false;

  for (let i = 0; i < preceding.length; i++) {
    const token = preceding[i] ?? "";

    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (token.startsWith("-") && !token.includes("=")) {
      if (flagTakesValue(rootArgs, token)) {
        skipNext = true;
      }
      continue;
    }

    if (!token.startsWith("-")) {
      commandName = token;
      commandTokenIndex = i;
      break;
    }
  }

  // Find subcommand name, skipping flag values for root + command args
  let subcommandName: string | undefined;
  let mod: Awaited<ReturnType<typeof importCommand>> | undefined;

  if (commandName && isCommand(commandName)) {
    mod = await importCommand(commandName);
    const combinedArgs: ArgsDefinition = { ...rootArgs, ...mod.args };
    skipNext = false;

    for (let i = commandTokenIndex + 1; i < preceding.length; i++) {
      const token = preceding[i] ?? "";

      if (skipNext) {
        skipNext = false;
        continue;
      }

      if (token.startsWith("-") && !token.includes("=")) {
        if (flagTakesValue(combinedArgs, token)) {
          skipNext = true;
        }
        continue;
      }

      if (!token.startsWith("-")) {
        subcommandName = token;
        break;
      }
    }
  }

  // Check if the last preceding token is a flag that expects a value,
  // making `partial` the value being completed.
  // Skip --flag=value tokens — the value is already bound inline.
  const lastPreceding = preceding.at(-1);
  if (lastPreceding?.startsWith("-") && !lastPreceding.includes("=")) {
    const result = await tryCompleteFlag(ctx, lastPreceding, partial, tokens, commandName, subcommandName);
    if (result !== undefined) {
      return result;
    }
  }

  // No command yet — complete command names + root flags
  if (!commandName || !isCommand(commandName) || !mod) {
    if (!commandName) {
      const modules = await Promise.all(Commands.map((cmd) => importCommand(cmd)));
      const visibleCommands = Commands.filter((_, i) => !modules[i].hidden);
      const commandNames = filterByPrefix(visibleCommands, partial);
      const rootFlagNames = getFlagNames(rootArgs, partial);
      return [...commandNames, ...rootFlagNames];
    }
    return [];
  }

  // Parent command with subcommands, no subcommand chosen yet
  if ("subcommands" in mod && mod.subcommands && !subcommandName) {
    const subNames = filterByPrefix(Object.keys(mod.subcommands), partial);
    const flagNames = getFlagNames({ ...rootArgs, ...mod.args }, partial);
    return [...subNames, ...flagNames];
  }

  // Leaf command or subcommand chosen — complete flags
  const mergedArgs: ArgsDefinition = { ...rootArgs, ...mod.args };
  if ("subcommands" in mod && mod.subcommands && subcommandName && subcommandName in mod.subcommands) {
    return getFlagNames({ ...mergedArgs, ...mod.subcommands[subcommandName].args }, partial);
  }

  return getFlagNames(mergedArgs, partial);
};

/**
 * Tries to complete a flag value. Returns candidates if the flag has a completer,
 * undefined if the flag doesn't take a value or has no completer.
 */
const tryCompleteFlag = async (
  ctx: Context,
  flagToken: string,
  partial: string,
  argv: string[],
  commandName?: string,
  subcommandName?: string,
): Promise<string[] | undefined> => {
  if (!commandName || !isCommand(commandName)) {
    return findAndCallCompleter(ctx, rootArgs, flagToken, partial, argv);
  }

  const mod = await importCommand(commandName);
  const mergedArgs: ArgsDefinition = { ...rootArgs, ...mod.args };

  if ("subcommands" in mod && mod.subcommands && subcommandName && subcommandName in mod.subcommands) {
    return findAndCallCompleter(ctx, { ...mergedArgs, ...mod.subcommands[subcommandName].args }, flagToken, partial, argv);
  }

  return findAndCallCompleter(ctx, mergedArgs, flagToken, partial, argv);
};

/**
 * Finds the complete function for a flag in an ArgsDefinition and calls it.
 */
const findAndCallCompleter = async (
  ctx: Context,
  args: ArgsDefinition,
  flagToken: string,
  partial: string,
  argv: string[],
): Promise<string[] | undefined> => {
  const canonicalKey = resolveFlag(args, flagToken);
  if (!canonicalKey) return undefined;

  const def = args[canonicalKey];

  // Check if the flag takes a value (not boolean/count)
  if (def.type === Boolean || def.type === arg.COUNT) return undefined;

  // Check for completer
  if (typeof def.complete === "function") {
    return def.complete(ctx, partial, argv);
  }

  // Flag takes a value but has no completer
  return [];
};

/**
 * Returns true if the flag token refers to a flag that takes a value argument
 * (i.e., not boolean and not a count flag). Used to skip the next token in
 * the command/subcommand detection loop.
 */
const flagTakesValue = (args: ArgsDefinition, flagToken: string): boolean => {
  const key = resolveFlag(args, flagToken);
  if (!key) return false;
  const def = args[key];
  return def.type !== Boolean && def.type !== arg.COUNT;
};

/**
 * Resolves a flag token (e.g., "-a", "--app") to its canonical key.
 */
const resolveFlag = (args: ArgsDefinition, flagToken: string): string | undefined => {
  if (flagToken in args) return flagToken;

  for (const [key, def] of Object.entries(args)) {
    for (const alias of toEntryArray(def.alias)) {
      if (aliasName(alias) === flagToken) return key;
    }
  }

  return undefined;
};

/**
 * Gets all visible flag names (canonical + aliases) that match the partial string.
 */
const getFlagNames = (args: ArgsDefinition, partial: string): string[] => {
  const names = flagWords(extractFlags(args).filter((f) => !f.hidden));
  return filterByPrefix(names, partial);
};
