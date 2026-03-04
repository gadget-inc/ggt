import arg from "arg";

import { println } from "../output/print.js";
import { closestMatch } from "../util/collection.js";
import { aliasName, ArgError, parseArgs, toEntryArray, type ArgsDefinition } from "./arg.js";
import type { CommandConfig, LeafCommandConfig, ParentCommandConfig, PositionalDef } from "./command.js";
import type { Context } from "./context.js";
import { renderDetailedUsage, renderShortUsage, renderUsageHint, type UsageInput } from "./usage.js";

/**
 * Runs a command, handling argument parsing, subcommand routing,
 * alias resolution, and help flag rendering.
 *
 * For leaf commands: parses args and calls `command.run`.
 * For parent commands: resolves the subcommand from argv, merges
 * parent and subcommand args, and calls the subcommand's `run`.
 */
export const runCommand = async (ctx: Context, command: CommandConfig, ...argv: string[]): Promise<void> => {
  if (command.subcommands) {
    await runParent(ctx, command as ParentCommandConfig, argv);
  } else {
    await runLeaf(ctx, command as LeafCommandConfig, argv);
  }
};

const printHelpAndExit = (name: string, mod: UsageInput, helpLevel: "-h" | "--help"): never => {
  const render = helpLevel === "--help" ? renderDetailedUsage : renderShortUsage;
  println(render(name, mod));
  process.exit(0);
};

const resolveHelpLevel = (argv: string[], valueTakingFlags: Set<string>): "-h" | "--help" | undefined => {
  if (hasStandaloneFlag(argv, "--help", valueTakingFlags)) {
    return "--help";
  }
  if (hasStandaloneFlag(argv, "-h", valueTakingFlags)) {
    return "-h";
  }
  return undefined;
};

/**
 * Validates that all required positional arguments are present in the
 * parsed `_` array. Throws an ArgError for the first missing one.
 */
const validateRequiredPositionals = (positionals: readonly PositionalDef[] | undefined, parsedPositionals: string[]): void => {
  if (!positionals) return;
  for (const [i, def] of positionals.entries()) {
    if (def.required && i >= parsedPositionals.length) {
      throw new ArgError(`Missing required argument: ${def.name}`);
    }
  }
};

const runWithUsageHint = async (fn: () => Promise<void> | void, commandPath: string, mod: UsageInput): Promise<void> => {
  try {
    await fn();
  } catch (error) {
    if (error instanceof ArgError && error.usageHint) {
      error.attachUsageHint(renderUsageHint(commandPath, mod));
    }
    throw error;
  }
};

const runLeaf = async (ctx: Context, command: LeafCommandConfig, argv: string[]): Promise<void> => {
  // handle help flags
  const valueTakingFlags = buildValueTakingFlags(command.args ?? {});
  const helpLevel = resolveHelpLevel(argv, valueTakingFlags);
  if (helpLevel) {
    printHelpAndExit(command.name, command, helpLevel);
  }

  await runWithUsageHint(
    async () => {
      const args = parseArgs(command.args ?? {}, { argv, ...command.parseOptions });
      validateRequiredPositionals(command.positionals, args._);
      await command.run(ctx, args);
    },
    command.name,
    command,
  );
};

const runParent = async (ctx: Context, command: ParentCommandConfig, argv: string[]): Promise<void> => {
  const { subcommands } = command;
  const valueTakingFlags = buildValueTakingFlags(command.args ?? {});

  // find the subcommand name (first positional token) and remove it from argv
  const positional = findFirstPositional(argv, valueTakingFlags);
  const rest = positional ? [...argv.slice(0, positional.index), ...argv.slice(positional.index + 1)] : [...argv];
  // If no alias match, fall back to the raw token so the "unknown subcommand" error names it correctly
  const name = positional ? (resolveSubcommandName(positional.token, subcommands) ?? positional.token) : undefined;

  // handle help flags
  const sub = name !== undefined && Object.prototype.hasOwnProperty.call(subcommands, name) ? subcommands[name] : undefined;
  const mergedValueTakingFlags = sub ? buildValueTakingFlags({ ...command.args, ...sub.args }) : valueTakingFlags;
  const helpLevel = resolveHelpLevel(rest, mergedValueTakingFlags);
  if (helpLevel) {
    if (sub) {
      printHelpAndExit(`${command.name} ${name}`, { ...sub, args: { ...command.args, ...sub.args } }, helpLevel);
    }
    printHelpAndExit(command.name, command, helpLevel);
  }

  // no subcommand given — show parent help
  if (!name) {
    return printHelpAndExit(command.name, command, "-h");
  }

  // unknown subcommand
  if (!sub) {
    const keys = Object.keys(subcommands);
    const suggestion = keys.length > 0 ? closestMatch(name, keys) : undefined;
    const parts = [`Unknown subcommand ${name}`];
    if (suggestion) {
      parts.push(`Did you mean ${suggestion}?`);
    }
    parts.push(renderUsageHint(command.name, command));
    throw new ArgError(parts.join("\n\n"), { usageHint: false });
  }
  const mergedArgs: ArgsDefinition = { ...command.args, ...sub.args };
  const subCommandPath = `${command.name} ${name}`;
  const subMod: UsageInput = { ...sub, args: mergedArgs };
  // Subcommands inherit the parent's parseOptions. SubcommandConfig intentionally omits parseOptions to keep the API surface small -- subcommands don't need independent parse mode.
  await runWithUsageHint(
    async () => {
      const args = parseArgs(mergedArgs, { argv: rest, ...command.parseOptions });
      validateRequiredPositionals(sub.positionals, args._);
      // oxlint-disable-next-line no-unsafe-call -- sub.run is StoredSubcommand["run"], typed (ctx, never) => Promisable<void>
      await sub.run(ctx, args as never);
    },
    subCommandPath,
    subMod,
  );
};

/**
 * Builds a set of flag tokens (including aliases) whose type takes a
 * value — i.e. everything except Boolean and arg.COUNT.
 */
const buildValueTakingFlags = (args: ArgsDefinition): Set<string> => {
  const flags = new Set<string>();
  for (const [key, value] of Object.entries(args)) {
    if (value.type === Boolean) {
      continue;
    }
    if (value.type === arg.COUNT) {
      continue;
    }
    flags.add(key);
    for (const entry of toEntryArray(value.alias)) {
      flags.add(aliasName(entry));
    }
  }
  return flags;
};

/**
 * Returns true if `flag` appears as a standalone token in `argv`,
 * skipping tokens that are values of preceding flags.
 */
const hasStandaloneFlag = (argv: string[], flag: string, valueTakingFlags: Set<string>): boolean => {
  let i = 0;
  while (i < argv.length) {
    const token = argv[i] as string;
    // -- terminates options; everything after is a positional
    if (token === "--") return false;
    if (token === flag) {
      return true;
    }
    // if this is a value-taking flag without =, skip its value
    if (token.startsWith("-") && !token.includes("=") && valueTakingFlags.has(token)) {
      i++;
    }
    i++;
  }
  return false;
};

/**
 * Scans argv for the first positional (non-flag) token, skipping
 * values of flags that take arguments.
 */
const findFirstPositional = (argv: string[], valueTakingFlags: Set<string>): { token: string; index: number } | undefined => {
  let i = 0;
  while (i < argv.length) {
    const token = argv[i] as string;
    // -- terminates options; do not look past it for a subcommand
    if (token === "--") return undefined;
    if (!token.startsWith("-")) {
      return { token, index: i };
    }
    if (!token.includes("=") && valueTakingFlags.has(token)) {
      i++;
    }
    i++;
  }
  return undefined;
};

/**
 * Resolves a token to a subcommand name via direct lookup, then alias lookup.
 */
const resolveSubcommandName = (token: string, subcommands: ParentCommandConfig["subcommands"]): string | undefined => {
  if (Object.prototype.hasOwnProperty.call(subcommands, token)) return token;
  for (const [name, sub] of Object.entries(subcommands)) {
    if (sub.aliases?.includes(token)) return name;
  }
  return undefined;
};
