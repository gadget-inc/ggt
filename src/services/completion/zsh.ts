import type { CommandDef, CompletionData, FlagDef } from "./completions.js";

/**
 * Generates a complete Zsh completion script for ggt.
 */
export const generateZshCompletions = (data: CompletionData): string => {
  const lines: string[] = [];

  lines.push("#compdef ggt");
  lines.push("");

  // helper functions for commands with subcommands
  for (const cmd of data.commands) {
    if (cmd.subcommands.length > 0) {
      lines.push(...generateSubcommandHelper(cmd));
      lines.push("");
    }
  }

  // main _ggt function
  lines.push("_ggt() {");
  lines.push("  local -a commands");
  lines.push("  local state");
  lines.push("");
  lines.push("  _arguments -C \\");

  // root flags
  for (const flag of data.rootFlags) {
    lines.push(`    ${zshFlagSpec(flag)} \\`);
  }

  lines.push("    '1:command:->command' \\");
  lines.push("    '*::arg:->args'");
  lines.push("");

  // command state
  lines.push("  case $state in");
  lines.push("    command)");
  lines.push("      commands=(");
  for (const cmd of data.commands) {
    lines.push(`        '${cmd.name}:${escapeZsh(cmd.description)}'`);
  }
  lines.push("      )");
  lines.push("      _describe -t commands 'ggt command' commands");
  lines.push("      ;;");

  // args state
  lines.push("    args)");
  lines.push("      case $words[1] in");

  for (const cmd of data.commands) {
    if (cmd.subcommands.length > 0) {
      lines.push(`        ${cmd.name})`);
      lines.push(`          _ggt_${sanitizeName(cmd.name)}`);
      lines.push("          ;;");
    } else if (cmd.flags.length > 0) {
      lines.push(`        ${cmd.name})`);
      lines.push("          _arguments \\");
      const flagSpecs = cmd.flags.map((f) => zshFlagSpec(f));
      for (let i = 0; i < flagSpecs.length; i++) {
        const suffix = i < flagSpecs.length - 1 ? " \\" : "";
        lines.push(`            ${flagSpecs[i]}${suffix}`);
      }
      lines.push("          ;;");
    }
  }

  lines.push("      esac");
  lines.push("      ;;");
  lines.push("  esac");
  lines.push("}");
  lines.push("");
  lines.push('_ggt "$@"');
  lines.push("");

  return lines.join("\n");
};

/**
 * Generates a helper function for a command with subcommands.
 */
const generateSubcommandHelper = (cmd: CommandDef): string[] => {
  const fnName = `_ggt_${sanitizeName(cmd.name)}`;
  const lines: string[] = [];

  lines.push(`${fnName}() {`);
  lines.push("  local -a subcommands");
  lines.push("  local state");
  lines.push("");
  lines.push("  _arguments -C \\");

  // command-level flags
  for (const flag of cmd.flags) {
    lines.push(`    ${zshFlagSpec(flag)} \\`);
  }

  lines.push("    '1:subcommand:->subcommand' \\");
  lines.push("    '*::arg:->args'");
  lines.push("");

  lines.push("  case $state in");
  lines.push("    subcommand)");
  lines.push("      subcommands=(");
  for (const sub of cmd.subcommands) {
    lines.push(`        '${sub.name}:${escapeZsh(sub.description)}'`);
  }
  lines.push("      )");
  lines.push(`      _describe -t subcommands '${cmd.name} subcommand' subcommands`);
  lines.push("      ;;");

  lines.push("    args)");
  lines.push("      case $words[1] in");

  for (const sub of cmd.subcommands) {
    const allFlags = [...cmd.flags, ...sub.flags];
    if (allFlags.length > 0) {
      lines.push(`        ${sub.name})`);
      lines.push("          _arguments \\");
      const flagSpecs = allFlags.map((f) => zshFlagSpec(f));
      for (let i = 0; i < flagSpecs.length; i++) {
        const suffix = i < flagSpecs.length - 1 ? " \\" : "";
        lines.push(`            ${flagSpecs[i]}${suffix}`);
      }
      lines.push("          ;;");
    }
  }

  lines.push("      esac");
  lines.push("      ;;");
  lines.push("  esac");
  lines.push("}");

  return lines;
};

/**
 * Formats a FlagDef into a zsh _arguments spec string.
 */
const zshFlagSpec = (flag: FlagDef): string => {
  const desc = escapeZsh(flag.description);
  const needsArg = flag.type === "string" || flag.type === "number";

  // build exclusion group from aliases
  const allNames = [flag.name, ...flag.aliases];
  const exclusion = allNames.length > 1 ? `'(${allNames.join(" ")})'` : "";

  const argSuffix = needsArg ? ":value:" : "";

  if (allNames.length === 1) {
    return `${exclusion}'${flag.name}[${desc}]${argSuffix}'`;
  }

  // generate one spec per alias so zsh sees all forms
  const specs: string[] = [];
  for (const name of allNames) {
    specs.push(`${exclusion}'${name}[${desc}]${argSuffix}'`);
  }
  return specs.join(" \\\n            ");
};

/**
 * Escapes single quotes and brackets for zsh completion descriptions.
 */
const escapeZsh = (str: string): string => {
  return str.replace(/'/g, "'\\''").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
};

/**
 * Sanitizes a command name for use as a function name (e.g., agent-plugin -> agent_plugin).
 */
const sanitizeName = (name: string): string => {
  return name.replace(/-/g, "_");
};
