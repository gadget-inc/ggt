import arg from "arg";

import { flags as rootFlagsDef } from "../../commands/root.js";
import { withAllowFlags } from "../command/allow.js";
import {
  type CommandConfig,
  type ParentCommandConfig,
  Commands,
  importCommand,
  isCommand,
  resolveCommandAlias,
} from "../command/command.js";
import type { Context } from "../command/context.js";
import { extractFlags, flagWords, aliasName, toEntryArray, type FlagsDefinition } from "../command/flag.js";
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

/**
 * Scans tokens starting at `from`, skipping flag values for the given args,
 * and returns the first positional token and its index (or undefined).
 */
const findFirstPositional = (tokens: string[], args: FlagsDefinition, from: number): { value: string; index: number } | undefined => {
  let skipNext = false;
  for (let i = from; i < tokens.length; i++) {
    const token = tokens[i] ?? "";

    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (token.startsWith("-") && !token.includes("=")) {
      if (flagTakesValue(args, token)) {
        skipNext = true;
      }
      continue;
    }

    if (!token.startsWith("-")) {
      return { value: token, index: i };
    }
  }
  return undefined;
};

const getCompletionCandidates = async (ctx: Context, tokens: string[]): Promise<string[]> => {
  const partial = tokens.at(-1) ?? "";
  const preceding = tokens.slice(0, -1);

  // Find command name from preceding tokens, skipping root flag values
  const commandMatch = findFirstPositional(preceding, rootFlagsDef, 0);

  // Find subcommand name, skipping flag values for root + command flags
  let subcommandName: string | undefined;
  let mod: CommandConfig | undefined;

  // Compute merged flags once: root + command (with allow flags) + subcommand
  let mergedFlagsDef: FlagsDefinition = rootFlagsDef;

  // Resolve command name, checking aliases if not a direct match
  let resolvedCommand = commandMatch?.value;
  if (resolvedCommand && !isCommand(resolvedCommand)) {
    resolvedCommand = await resolveCommandAlias(resolvedCommand);
  }

  if (resolvedCommand && isCommand(resolvedCommand)) {
    mod = await importCommand(resolvedCommand);
    mergedFlagsDef = { ...rootFlagsDef, ...withAllowFlags(mod.flags ?? {}) };
    const subMatch = findFirstPositional(preceding, mergedFlagsDef, (commandMatch?.index ?? 0) + 1);
    subcommandName = subMatch?.value;

    // Resolve subcommand aliases
    if (subcommandName && "subcommands" in mod && mod.subcommands) {
      const resolved = resolveSubcommandAlias(subcommandName, (mod as ParentCommandConfig).subcommands);
      if (resolved) {
        subcommandName = resolved;
      }
    }
  }

  // Check if the last preceding token is a flag that expects a value,
  // making `partial` the value being completed.
  // Skip --flag=value tokens -- the value is already bound inline.
  const lastPreceding = preceding.at(-1);
  if (lastPreceding?.startsWith("-") && !lastPreceding.includes("=")) {
    const result = await tryCompleteFlag(ctx, lastPreceding, partial, tokens, mergedFlagsDef, subcommandName, mod);
    if (result !== undefined) {
      return result;
    }
  }

  // No command token yet -- complete command names + root flags
  if (!commandMatch) {
    const modules = await Promise.all(Commands.map((cmd) => importCommand(cmd)));
    const visibleCommands = Commands.filter((_, i) => !modules[i].hidden);
    const commandNames = filterByPrefix(visibleCommands, partial);
    const rootFlagNames = getFlagNames(rootFlagsDef, partial);
    return [...commandNames, ...rootFlagNames];
  }

  // Command token present but unrecognized (not a valid command or alias)
  if (!mod) {
    return [];
  }

  // Parent command with subcommands, no subcommand chosen yet
  if ("subcommands" in mod && mod.subcommands && !subcommandName) {
    const subNames = filterByPrefix(Object.keys(mod.subcommands), partial);
    const flagNames = getFlagNames(mergedFlagsDef, partial);
    return [...subNames, ...flagNames];
  }

  // Leaf command or subcommand chosen -- complete flags
  if ("subcommands" in mod && mod.subcommands && subcommandName && Object.prototype.hasOwnProperty.call(mod.subcommands, subcommandName)) {
    return getFlagNames({ ...mergedFlagsDef, ...mod.subcommands[subcommandName].flags }, partial);
  }

  return getFlagNames(mergedFlagsDef, partial);
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
  mergedFlagsDef: FlagsDefinition,
  subcommandName?: string,
  mod?: CommandConfig,
): Promise<string[] | undefined> => {
  if (!mod) {
    return findAndCallCompleter(ctx, rootFlagsDef, flagToken, partial, argv);
  }

  if ("subcommands" in mod && mod.subcommands && subcommandName && Object.prototype.hasOwnProperty.call(mod.subcommands, subcommandName)) {
    return findAndCallCompleter(ctx, { ...mergedFlagsDef, ...mod.subcommands[subcommandName].flags }, flagToken, partial, argv);
  }

  return findAndCallCompleter(ctx, mergedFlagsDef, flagToken, partial, argv);
};

/**
 * Finds the complete function for a flag in an FlagsDefinition and calls it.
 */
const findAndCallCompleter = async (
  ctx: Context,
  args: FlagsDefinition,
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
const flagTakesValue = (args: FlagsDefinition, flagToken: string): boolean => {
  const key = resolveFlag(args, flagToken);
  if (!key) return false;
  const def = args[key];
  return def.type !== Boolean && def.type !== arg.COUNT;
};

/**
 * Resolves a flag token (e.g., "-a", "--app") to its canonical key.
 */
const resolveFlag = (args: FlagsDefinition, flagToken: string): string | undefined => {
  if (flagToken in args) return flagToken;

  for (const [key, def] of Object.entries(args)) {
    for (const alias of toEntryArray(def.alias)) {
      if (aliasName(alias) === flagToken) return key;
    }
  }

  return undefined;
};

/**
 * Resolves a subcommand token to its canonical name, checking direct lookup then aliases.
 */
const resolveSubcommandAlias = (token: string, subcommands: ParentCommandConfig["subcommands"]): string | undefined => {
  if (Object.prototype.hasOwnProperty.call(subcommands, token)) return token;
  for (const [name, sub] of Object.entries(subcommands)) {
    if (sub.aliases?.includes(token)) return name;
  }
  return undefined;
};

/**
 * Gets all visible flag names (canonical + aliases) that match the partial string.
 */
const getFlagNames = (args: FlagsDefinition, partial: string): string[] => {
  const names = flagWords(extractFlags(args).filter((f) => !f.hidden));
  return filterByPrefix(names, partial);
};
