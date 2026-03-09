import { deduplicateFlags, flagWords, type FlagDef } from "../command/arg.js";
import type { CompletionData } from "./completions.js";

/**
 * Generates a complete Bash completion script for ggt.
 */
export const generateBashCompletions = (data: CompletionData): string => {
  const lines: string[] = [];

  lines.push("# bash completion for ggt -*- shell-script -*-");
  lines.push("");
  lines.push("_ggt_completions() {");
  lines.push('  local cur="${COMP_WORDS[COMP_CWORD]}"');
  lines.push("");

  // collect all flag names that have dynamic completers
  const completerFlags = new Set<string>();
  const addCompleterFlags = (flags: FlagDef[]): void => {
    for (const f of flags) {
      if (f.hasCompleter) {
        completerFlags.add(f.name);
        for (const a of f.aliases) {
          completerFlags.add(a);
        }
      }
    }
  };
  addCompleterFlags(data.rootFlags);
  for (const cmd of data.commands) {
    addCompleterFlags(cmd.flags);
    for (const sub of cmd.subcommands) {
      addCompleterFlags(sub.flags);
    }
  }

  if (completerFlags.size > 0) {
    lines.push('  local prev="${COMP_WORDS[COMP_CWORD-1]}"');
    lines.push("");
    lines.push('  case "$prev" in');
    lines.push(`    ${[...completerFlags].join("|")})`);
    lines.push('      COMPREPLY=($(ggt --__complete "${COMP_WORDS[@]:1}" 2>/dev/null))');
    lines.push("      return ;;");
    lines.push("  esac");
    lines.push("");
  }

  const rootFlagWords = flagWords(data.rootFlags);
  const commandNames = data.commands.map((c) => c.name);

  // top-level completion: commands + root flags
  lines.push("  if [[ $COMP_CWORD -eq 1 ]]; then");
  lines.push(`    COMPREPLY=($(compgen -W "${[...commandNames, ...rootFlagWords].join(" ")}" -- "$cur"))`);
  lines.push("    return");
  lines.push("  fi");
  lines.push("");

  // per-command completion
  lines.push('  case "${COMP_WORDS[1]}" in');

  for (const cmd of data.commands) {
    if (cmd.subcommands.length > 0) {
      lines.push(`    ${cmd.name})`);
      lines.push("      if [[ $COMP_CWORD -eq 2 ]]; then");

      const subNames = cmd.subcommands.map((s) => s.name);
      const cmdFlagList = flagWords(cmd.flags);
      lines.push(`        COMPREPLY=($(compgen -W "${[...subNames, ...cmdFlagList, ...rootFlagWords].join(" ")}" -- "$cur"))`);

      lines.push("      else");
      lines.push('        case "${COMP_WORDS[2]}" in');

      for (const sub of cmd.subcommands) {
        const subFlagList = flagWords(deduplicateFlags([...cmd.flags, ...sub.flags]));
        lines.push(`          ${sub.name})`);
        lines.push(`            COMPREPLY=($(compgen -W "${[...subFlagList, ...rootFlagWords].join(" ")}" -- "$cur"))`);
        lines.push("            ;;");
      }

      lines.push("          *)");
      lines.push(`            COMPREPLY=($(compgen -W "${[...cmdFlagList, ...rootFlagWords].join(" ")}" -- "$cur"))`);
      lines.push("            ;;");
      lines.push("        esac");
      lines.push("      fi");
      lines.push("      ;;");
    } else {
      const cmdFlagList = flagWords(cmd.flags);
      lines.push(`    ${cmd.name})`);
      lines.push(`      COMPREPLY=($(compgen -W "${[...cmdFlagList, ...rootFlagWords].join(" ")}" -- "$cur"))`);
      lines.push("      ;;");
    }
  }

  lines.push("  esac");
  lines.push("}");
  lines.push("");
  lines.push("complete -F _ggt_completions ggt");
  lines.push("");

  return lines.join("\n");
};
