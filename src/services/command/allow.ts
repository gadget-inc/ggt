import { closestMatch } from "../util/collection.js";
import { ArgError, type ArgsDefinition } from "./arg.js";

/**
 * Scans an ArgsDefinition for `--allow-*` flags, returning the matching keys.
 */
export const getAllowFlags = (args: ArgsDefinition): string[] => {
  return Object.keys(args).filter((key) => key.startsWith("--allow-"));
};

/**
 * Returns args merged with AllowArgs if the command has `--allow-*` flags.
 */
export const withAllowArgs = (args: ArgsDefinition): ArgsDefinition => {
  return getAllowFlags(args).length > 0 ? { ...args, ...AllowArgs } : args;
};

/**
 * Args definition for `--allow` and `--allow-all`, injected automatically
 * into commands that have `--allow-*` flags for help text display.
 */
export const AllowArgs: ArgsDefinition = {
  "--allow": {
    type: String,
    description: "Enable allow flags (comma-separated)",
    valueName: "flag,...",
    brief: false,
  },
  "--allow-all": {
    type: Boolean,
    description: "Enable all --allow-* flags",
    brief: false,
  },
};

/**
 * Extracts `--allow` and `--allow-all` tokens from argv, returning the
 * cleaned argv and the collected allow values.
 *
 * This preprocessing step is needed because `--allow` accepts
 * comma-separated shorthands that don't fit neatly into the arg parser.
 */
export const extractAllowArgs = (
  argv: string[],
  allowFlags: string[],
): { cleanedArgv: string[]; allowAll: boolean; allowValues: string[] } => {
  if (allowFlags.length === 0) {
    return { cleanedArgv: argv, allowAll: false, allowValues: [] };
  }

  const cleanedArgv: string[] = [];
  const allowValues: string[] = [];
  let allowAll = false;

  let i = 0;
  let pastSeparator = false;
  while (i < argv.length) {
    const token = argv[i] ?? "";

    // -- terminates options; pass everything after it through unchanged
    if (token === "--") {
      pastSeparator = true;
      cleanedArgv.push(token);
      i++;
      continue;
    }

    if (!pastSeparator) {
      if (token === "--allow-all") {
        allowAll = true;
        i++;
        continue;
      }

      if (token === "--allow") {
        if (i + 1 >= argv.length) {
          throw new ArgError('Flag "--allow" requires a value');
        }
        allowValues.push(argv[i + 1] as string);
        i += 2;
        continue;
      }

      if (token.startsWith("--allow=")) {
        allowValues.push(token.slice("--allow=".length));
        i++;
        continue;
      }
    }

    cleanedArgv.push(token);
    i++;
  }

  return { cleanedArgv, allowAll, allowValues };
};

/**
 * Expands `--allow` and `--allow-all` shorthands into the individual
 * boolean `--allow-*` flags on the parsed args object.
 *
 * Mutates `args` in place. Throws ArgError for unknown shorthands.
 */
export const resolveAllowFlags = (
  args: Record<string, unknown>,
  allowFlags: string[],
  extracted: { allowAll: boolean; allowValues: string[] },
): void => {
  const shorthandMap = new Map<string, string>();
  for (const flag of allowFlags) {
    // --allow-data-delete → data-delete
    shorthandMap.set(flag.slice("--allow-".length), flag);
  }

  // Flatten comma-separated values and check for "all"
  const shorthands: string[] = [];
  let hasAll = extracted.allowAll;
  for (const raw of extracted.allowValues) {
    for (const shorthand of raw.split(",")) {
      const trimmed = shorthand.trim();
      if (trimmed === "") continue;
      if (trimmed === "all") {
        hasAll = true;
      } else {
        shorthands.push(trimmed);
      }
    }
  }

  if (hasAll) {
    for (const flag of allowFlags) {
      args[flag] = true;
    }
  }

  // resolve individual shorthands
  for (const shorthand of shorthands) {
    const flag = shorthandMap.get(shorthand);
    if (!flag) {
      const keys = [...shorthandMap.keys()];
      const suggestion = keys.length > 0 ? closestMatch(shorthand, keys) : undefined;
      const parts = [`Unknown allow flag "${shorthand}".`];
      if (suggestion) parts.push(`Did you mean "${suggestion}"?`);
      parts.push(`Available: ${keys.join(", ")}`);
      throw new ArgError(parts.join(" "));
    }
    args[flag] = true;
  }
};
