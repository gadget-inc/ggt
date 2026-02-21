import type { FlagDef } from "../command/arg.js";
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

  const rootFlagWords = flagWords(data.rootFlags);
  const commandNames = data.commands.map((c) => c.name);

  // top-level completion: commands + root flags
  lines.push("  if [[ COMP_CWORD -eq 1 ]]; then");
  lines.push(`    COMPREPLY=($(compgen -W "${[...commandNames, ...rootFlagWords].join(" ")}" -- "$cur"))`);
  lines.push("    return");
  lines.push("  fi");
  lines.push("");

  // per-command completion
  lines.push('  case "${COMP_WORDS[1]}" in');

  for (const cmd of data.commands) {
    if (cmd.subcommands.length > 0) {
      lines.push(`    ${cmd.name})`);
      lines.push("      if [[ COMP_CWORD -eq 2 ]]; then");

      const subNames = cmd.subcommands.map((s) => s.name);
      const cmdFlagList = flagWords(cmd.flags);
      lines.push(`        COMPREPLY=($(compgen -W "${[...subNames, ...cmdFlagList, ...rootFlagWords].join(" ")}" -- "$cur"))`);

      lines.push("      else");
      lines.push('        case "${COMP_WORDS[2]}" in');

      for (const sub of cmd.subcommands) {
        const subFlagList = flagWords([...cmd.flags, ...sub.flags]);
        lines.push(`          ${sub.name})`);
        lines.push(`            COMPREPLY=($(compgen -W "${[...subFlagList, ...rootFlagWords].join(" ")}" -- "$cur"))`);
        lines.push("            ;;");
      }

      lines.push("          *)");
      lines.push(`            COMPREPLY=($(compgen -W "${[...flagWords(cmd.flags), ...rootFlagWords].join(" ")}" -- "$cur"))`);
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
  lines.push("complete -o default -F _ggt_completions ggt");
  lines.push("");

  return lines.join("\n");
};

/**
 * Collects all long-form flag names and short aliases into a flat word list.
 */
const flagWords = (flags: FlagDef[]): string[] => {
  const words: string[] = [];
  for (const f of flags) {
    words.push(f.name);
    for (const a of f.aliases) {
      words.push(a);
    }
  }
  return words;
};
