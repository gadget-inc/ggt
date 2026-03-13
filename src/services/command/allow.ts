import { closestMatch } from "../util/collection.ts";
import { FlagError, type FlagsDefinition } from "./flag.ts";

/**
 * Scans an FlagsDefinition for `--allow-*` flags, returning the matching keys.
 */
export const getAllowFlags = (flagsDef: FlagsDefinition): string[] => {
  return Object.keys(flagsDef).filter((key) => key.startsWith("--allow-"));
};

/**
 * If the flags definition has `--allow-*` flags, merges in `AllowFlags`
 * and returns the combined definition. Otherwise returns the original.
 */
export const withAllowFlags = (flagsDef: FlagsDefinition): FlagsDefinition => {
  const allowFlags = getAllowFlags(flagsDef);
  if (allowFlags.length === 0) {
    return flagsDef;
  }
  return { ...flagsDef, ...AllowFlags };
};

/**
 * Flags definition for `--allow` and `--allow-all`, injected automatically
 * into commands that have `--allow-*` flags for help text display.
 */
export const AllowFlags: FlagsDefinition = {
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
export const extractAllowFlags = (
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
          throw new FlagError('Flag "--allow" requires a value');
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
 * boolean `--allow-*` flags on the parsed flags object.
 *
 * Mutates `flags` in place. Throws FlagError for unknown shorthands.
 */
export const resolveAllowFlags = (
  flags: Record<string, unknown>,
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
      flags[flag] = true;
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
      throw new FlagError(parts.join(" "));
    }
    flags[flag] = true;
  }
};
