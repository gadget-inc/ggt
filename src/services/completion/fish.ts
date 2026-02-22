import type { FlagDef } from "../command/arg.js";
import type { CompletionData } from "./completions.js";

/**
 * Generates a complete Fish completion script for ggt.
 */
export const generateFishCompletions = (data: CompletionData): string => {
  const lines: string[] = [];

  lines.push("# fish completion for ggt");
  lines.push("");
  lines.push("# Disable file completions by default");
  lines.push("complete -c ggt -f");
  lines.push("");

  // helper function for subcommand detection
  const subcommandParents = data.commands.filter((c) => c.subcommands.length > 0);
  if (subcommandParents.length > 0) {
    lines.push("# Helper: check if a specific subcommand of a parent command has been entered");
    lines.push("function __ggt_seen_subcommand");
    lines.push("  set -l parent $argv[1]");
    lines.push("  set -l sub $argv[2]");
    lines.push("  set -l cmd (commandline -opc)");
    lines.push("  set -l found_parent 0");
    lines.push("  for word in $cmd");
    lines.push("    if test $found_parent -eq 1");
    lines.push("      if test $word = $sub");
    lines.push("        return 0");
    lines.push("      end");
    lines.push("    end");
    lines.push("    if test $word = $parent");
    lines.push("      set found_parent 1");
    lines.push("    end");
    lines.push("  end");
    lines.push("  return 1");
    lines.push("end");
    lines.push("");

    lines.push("# Helper: check if we are positioned for a subcommand (parent seen, no subcommand yet)");
    lines.push("# Known limitation: flag values (e.g. `--app myapp`) are mistaken for subcommands");
    lines.push("function __ggt_needs_subcommand");
    lines.push("  set -l parent $argv[1]");
    lines.push("  set -l cmd (commandline -opc)");
    lines.push("  set -l found_parent 0");
    lines.push("  for word in $cmd");
    lines.push("    if test $found_parent -eq 1");
    lines.push("      # if the word after the parent is not a flag, a subcommand was entered");
    lines.push("      if not string match -q -- '-*' $word");
    lines.push("        return 1");
    lines.push("      end");
    lines.push("    end");
    lines.push("    if test $word = $parent");
    lines.push("      set found_parent 1");
    lines.push("    end");
    lines.push("  end");
    lines.push("  # parent was found but no subcommand yet");
    lines.push("  if test $found_parent -eq 1");
    lines.push("    return 0");
    lines.push("  end");
    lines.push("  return 1");
    lines.push("end");
    lines.push("");
  }

  // root flags
  lines.push("# Root flags");
  for (const flag of data.rootFlags) {
    lines.push(...fishFlagLine(flag, "__fish_use_subcommand"));
  }
  lines.push("");

  // commands
  lines.push("# Commands");
  for (const cmd of data.commands) {
    const desc = escapeFish(cmd.description);
    lines.push(`complete -c ggt -n '__fish_use_subcommand' -a '${cmd.name}' -d '${desc}'`);
  }
  lines.push("");

  // per-command flags and subcommands
  for (const cmd of data.commands) {
    lines.push(`# ${cmd.name}`);

    if (cmd.subcommands.length > 0) {
      // command-level flags (available when the parent is seen)
      for (const flag of cmd.flags) {
        lines.push(...fishFlagLine(flag, `__fish_seen_subcommand_from ${cmd.name}`));
      }

      // subcommand names
      for (const sub of cmd.subcommands) {
        const desc = escapeFish(sub.description);
        lines.push(`complete -c ggt -n '__ggt_needs_subcommand ${cmd.name}' -a '${sub.name}' -d '${desc}'`);
      }

      // subcommand-specific flags
      for (const sub of cmd.subcommands) {
        for (const flag of sub.flags) {
          lines.push(...fishFlagLine(flag, `__ggt_seen_subcommand ${cmd.name} ${sub.name}`));
        }
      }

      // root flags in parent and subcommand contexts
      for (const flag of data.rootFlags) {
        lines.push(...fishFlagLine(flag, `__fish_seen_subcommand_from ${cmd.name}`));
        for (const sub of cmd.subcommands) {
          lines.push(...fishFlagLine(flag, `__ggt_seen_subcommand ${cmd.name} ${sub.name}`));
        }
      }
    } else {
      for (const flag of cmd.flags) {
        lines.push(...fishFlagLine(flag, `__fish_seen_subcommand_from ${cmd.name}`));
      }

      // root flags in subcommand context
      for (const flag of data.rootFlags) {
        lines.push(...fishFlagLine(flag, `__fish_seen_subcommand_from ${cmd.name}`));
      }
    }

    lines.push("");
  }

  return lines.join("\n");
};

/**
 * Generates `complete` lines for a flag -- one per long name (canonical + long aliases).
 */
const fishFlagLine = (flag: FlagDef, condition: string): string[] => {
  const longNames = [flag.name.replace(/^--/, "")];
  const shortParts: string[] = [];

  for (const alias of flag.aliases) {
    if (alias.startsWith("--")) {
      longNames.push(alias.replace(/^--/, ""));
    } else if (alias.startsWith("-")) {
      shortParts.push(`-s ${alias.replace(/^-/, "")}`);
    }
  }

  const commonParts: string[] = [];

  if (flag.type === "string" || flag.type === "number") {
    commonParts.push("-r");
  }

  if (flag.description) {
    commonParts.push(`-d '${escapeFish(flag.description)}'`);
  }

  return longNames.map((name) => [`complete -c ggt -n '${condition}'`, `-l ${name}`, ...shortParts, ...commonParts].join(" "));
};

/**
 * Escapes single quotes for fish shell strings.
 *
 * Fish doesn't support backslash-escaped quotes inside single-quoted
 * strings. Instead, end the quote, insert an escaped quote, and
 * restart: 'it'\''s' → it's
 */
const escapeFish = (str: string): string => {
  return str.replace(/'/g, "'\\''");
};
