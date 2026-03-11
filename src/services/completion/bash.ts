import { flagWords, type FlagDef } from "../command/flag.js";
import { valueFlagNames, type CompletionData } from "./completions.js";

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

  // collect flag names that have dynamic completers and value-taking flags without completers
  const completerFlags = new Set<string>();
  const nonCompleterValueFlags = new Set<string>();
  const classifyFlags = (flags: FlagDef[]): void => {
    for (const f of flags) {
      if (f.hasCompleter) {
        completerFlags.add(f.name);
        for (const a of f.aliases) {
          completerFlags.add(a);
        }
      } else if (f.type === "string" || f.type === "number") {
        nonCompleterValueFlags.add(f.name);
        for (const a of f.aliases) {
          nonCompleterValueFlags.add(a);
        }
      }
    }
  };
  classifyFlags(data.rootFlags);
  for (const cmd of data.commands) {
    classifyFlags(cmd.flags);
    for (const sub of cmd.subcommands) {
      classifyFlags(sub.flags);
    }
  }

  if (completerFlags.size > 0 || nonCompleterValueFlags.size > 0) {
    lines.push('  local prev="${COMP_WORDS[COMP_CWORD-1]}"');
    lines.push("");
    lines.push('  case "$prev" in');
    if (completerFlags.size > 0) {
      lines.push(`    ${[...completerFlags].join("|")})`);
      lines.push("      local IFS=$'\\n'");
      lines.push('      COMPREPLY=($(ggt --__complete "${COMP_WORDS[@]:1}" 2>/dev/null))');
      lines.push("      return ;;");
    }
    if (nonCompleterValueFlags.size > 0) {
      lines.push(`    ${[...nonCompleterValueFlags].join("|")})`);
      lines.push("      return ;;");
    }
    lines.push("  esac");
    lines.push("");
  }

  const rootFlagWords = flagWords(data.rootFlags);
  const commandNames = data.commands.flatMap((c) => [c.name, ...c.aliases]);

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
      lines.push(`    ${[cmd.name, ...cmd.aliases].join("|")})`);

      // Collect all flag names (root + command) that take a value, so the
      // subcommand-finding loop can skip the flag's argument.
      const valueFlagList = valueFlagNames(data.rootFlags, cmd.flags);

      // Find the subcommand word by scanning COMP_WORDS after the command,
      // skipping flags and their values.
      lines.push("      local sub_cmd=");
      lines.push("      local __skip_next=0");
      lines.push("      for ((i=2; i < COMP_CWORD; i++)); do");
      lines.push('        local w="${COMP_WORDS[i]}"');
      lines.push("        if [[ $__skip_next -eq 1 ]]; then");
      lines.push("          __skip_next=0");
      lines.push("          continue");
      lines.push("        fi");
      if (valueFlagList.length > 0) {
        lines.push('        case "$w" in');
        lines.push(`          ${valueFlagList.join("|")}) __skip_next=1; continue ;;`);
        lines.push("        esac");
      }
      lines.push('        if [[ "$w" != -* ]]; then');
      lines.push('          sub_cmd="$w"');
      lines.push("          break");
      lines.push("        fi");
      lines.push("      done");
      lines.push("");

      const subNames = cmd.subcommands.flatMap((s) => [s.name, ...s.aliases]);
      const cmdFlagList = flagWords(cmd.flags);

      lines.push('      if [[ -z "$sub_cmd" ]]; then');
      lines.push(`        COMPREPLY=($(compgen -W "${[...subNames, ...cmdFlagList, ...rootFlagWords].join(" ")}" -- "$cur"))`);
      lines.push("      else");
      lines.push('        case "$sub_cmd" in');

      for (const sub of cmd.subcommands) {
        const subFlagList = flagWords([...cmd.flags, ...sub.flags]);
        lines.push(`          ${[sub.name, ...sub.aliases].join("|")})`);
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
      lines.push(`    ${[cmd.name, ...cmd.aliases].join("|")})`);
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
