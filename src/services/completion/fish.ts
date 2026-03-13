import type { FlagDef } from "../command/flag.ts";
import { valueFlagNames, type CompletionData } from "./completions.ts";

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

  // helper function for dynamic completions
  // When fish matches a flag (e.g. -a for --app) and evaluates the -a completer
  // for the flag's value, `commandline -ct` still returns the flag token itself
  // (e.g. "-a") if there's no space after it. This helper detects that case and
  // includes the flag as a preceding token with an empty partial, so the handler
  // sees e.g. ["dev", "-a", ""] and recognizes it as flag value completion.
  lines.push("# Helper: invoke ggt's dynamic completer with correct partial");
  lines.push("function __ggt_complete");
  lines.push("  set -l tokens (commandline -opc)[2..]");
  lines.push("  set -l current (commandline -ct)");
  lines.push("  # fish reports the flag token as $current without a trailing space;");
  lines.push("  # passing $current '' tells the handler to complete the flag value with an empty partial");
  lines.push("  if string match -q -- '-*' $current");
  lines.push("    ggt --__complete $tokens $current '' 2>/dev/null");
  lines.push("  else");
  lines.push("    ggt --__complete $tokens $current 2>/dev/null");
  lines.push("  end");
  lines.push("end");
  lines.push("");

  // helper function for subcommand detection
  const subcommandParents = data.commands.filter((c) => c.subcommands.length > 0);
  if (subcommandParents.length > 0) {
    lines.push("# Helper: check if a specific subcommand of a parent command has been entered");
    lines.push("# Usage: __ggt_seen_subcommand parentName [parentAlias...] -- subName [subAlias...] -- valueFlagName ...");
    lines.push("function __ggt_seen_subcommand");
    lines.push("  set -l parents");
    lines.push("  set -l subs");
    lines.push("  set -l vflags");
    lines.push("  set -l sep_count 0");
    lines.push("  for arg in $argv");
    lines.push("    if test $arg = '--'");
    lines.push("      set sep_count (math $sep_count + 1)");
    lines.push("    else if test $sep_count -eq 2");
    lines.push("      set -a vflags $arg");
    lines.push("    else if test $sep_count -eq 1");
    lines.push("      set -a subs $arg");
    lines.push("    else");
    lines.push("      set -a parents $arg");
    lines.push("    end");
    lines.push("  end");
    lines.push("  set -l cmd (commandline -opc)");
    lines.push("  set -l found_parent 0");
    lines.push("  set -l skip_next 0");
    lines.push("  for word in $cmd");
    lines.push("    if test $found_parent -eq 1");
    lines.push("      if test $skip_next -eq 1");
    lines.push("        set skip_next 0");
    lines.push("        continue");
    lines.push("      end");
    lines.push("      if set -q vflags[1]; and contains -- $word $vflags");
    lines.push("        set skip_next 1");
    lines.push("        continue");
    lines.push("      end");
    lines.push("      if contains -- $word $subs");
    lines.push("        return 0");
    lines.push("      end");
    lines.push("    end");
    lines.push("    if contains -- $word $parents");
    lines.push("      set found_parent 1");
    lines.push("    end");
    lines.push("  end");
    lines.push("  return 1");
    lines.push("end");
    lines.push("");

    lines.push("# Helper: check if we are positioned for a subcommand (parent seen, no subcommand yet)");
    lines.push("# Usage: __ggt_needs_subcommand parentName [parentAlias...] -- valueFlagName ...");
    lines.push("function __ggt_needs_subcommand");
    lines.push("  set -l parents");
    lines.push("  set -l vflags");
    lines.push("  set -l after_sep 0");
    lines.push("  for a in $argv");
    lines.push("    if test $a = '--'");
    lines.push("      set after_sep 1");
    lines.push("    else if test $after_sep -eq 1");
    lines.push("      set -a vflags $a");
    lines.push("    else");
    lines.push("      set -a parents $a");
    lines.push("    end");
    lines.push("  end");
    lines.push("  set -l cmd (commandline -opc)");
    lines.push("  set -l found_parent 0");
    lines.push("  set -l skip_next 0");
    lines.push("  for word in $cmd");
    lines.push("    if test $found_parent -eq 1");
    lines.push("      if test $skip_next -eq 1");
    lines.push("        set skip_next 0");
    lines.push("        continue");
    lines.push("      end");
    lines.push("      if contains -- $word $vflags");
    lines.push("        set skip_next 1");
    lines.push("        continue");
    lines.push("      end");
    lines.push("      if string match -q -- '-*' $word");
    lines.push("        continue");
    lines.push("      end");
    lines.push("      return 1");
    lines.push("    end");
    lines.push("    if contains -- $word $parents");
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
    for (const alias of cmd.aliases) {
      lines.push(`complete -c ggt -n '__fish_use_subcommand' -a '${alias}' -d '${desc}'`);
    }
  }
  lines.push("");

  // per-command flags and subcommands
  for (const cmd of data.commands) {
    lines.push(`# ${cmd.name}`);
    const cmdNames = [cmd.name, ...cmd.aliases].join(" ");

    if (cmd.subcommands.length > 0) {
      // command-level flags (available when the parent is seen)
      for (const flag of cmd.flags) {
        lines.push(...fishFlagLine(flag, `__fish_seen_subcommand_from ${cmdNames}`));
      }

      // subcommand names
      const vFlags = valueFlagNames(cmd.flags, data.rootFlags);
      const needsSubCond =
        vFlags.length > 0 ? `__ggt_needs_subcommand ${cmdNames} -- ${vFlags.join(" ")}` : `__ggt_needs_subcommand ${cmdNames}`;
      for (const sub of cmd.subcommands) {
        const desc = escapeFish(sub.description);
        lines.push(`complete -c ggt -n '${needsSubCond}' -a '${sub.name}' -d '${desc}'`);
        for (const alias of sub.aliases) {
          lines.push(`complete -c ggt -n '${needsSubCond}' -a '${alias}' -d '${desc}'`);
        }
      }

      // subcommand-specific flags
      const vFlagsSuffix = vFlags.length > 0 ? ` -- ${vFlags.join(" ")}` : "";
      for (const sub of cmd.subcommands) {
        const subNames = [sub.name, ...sub.aliases].join(" ");
        for (const flag of sub.flags) {
          lines.push(...fishFlagLine(flag, `__ggt_seen_subcommand ${cmdNames} -- ${subNames}${vFlagsSuffix}`));
        }
      }

      // root flags in parent and subcommand contexts
      for (const flag of data.rootFlags) {
        lines.push(...fishFlagLine(flag, `__fish_seen_subcommand_from ${cmdNames}`));
        for (const sub of cmd.subcommands) {
          const subNames = [sub.name, ...sub.aliases].join(" ");
          lines.push(...fishFlagLine(flag, `__ggt_seen_subcommand ${cmdNames} -- ${subNames}${vFlagsSuffix}`));
        }
      }
    } else {
      for (const flag of cmd.flags) {
        lines.push(...fishFlagLine(flag, `__fish_seen_subcommand_from ${cmdNames}`));
      }

      // root flags in command context
      for (const flag of data.rootFlags) {
        lines.push(...fishFlagLine(flag, `__fish_seen_subcommand_from ${cmdNames}`));
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
    if (flag.hasCompleter) {
      commonParts.push("-rfa '(__ggt_complete)'");
    } else if (flag.valueName === "path") {
      commonParts.push("-rF");
    } else {
      commonParts.push("-x");
    }
  }

  if (flag.description) {
    commonParts.push(`-d '${escapeFish(flag.description)}'`);
  }

  return longNames.map((name, i) => {
    const parts = [`complete -c ggt -n '${condition}'`, `-l ${name}`];
    // only attach short aliases to the first (canonical) long name
    if (i === 0) {
      parts.push(...shortParts);
    }
    parts.push(...commonParts);
    return parts.join(" ");
  });
};

/**
 * Escapes single quotes for fish shell strings.
 *
 * Fish doesn't support backslash-escaped quotes inside single-quoted
 * strings. Instead, end the quote, insert an escaped quote, and
 * restart: 'it'\''s' -> it's
 */
const escapeFish = (str: string): string => {
  return str.replace(/'/g, "'\\''");
};
