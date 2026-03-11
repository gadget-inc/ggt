import type { FlagDef } from "../command/flag.js";
import type { CommandDef, CompletionData } from "./completions.js";

/**
 * Renders flag specs with trailing backslash continuation, indented for use
 * inside an `_arguments` block.
 */
const renderFlagSpecs = (flagSpecs: string[]): string[] => {
  return flagSpecs.map((spec, i) => {
    const suffix = i < flagSpecs.length - 1 ? " \\" : "";
    return `            ${spec}${suffix}`;
  });
};

/**
 * Generates a complete Zsh completion script for ggt.
 */
export const generateZshCompletions = (data: CompletionData): string => {
  const lines: string[] = [];

  lines.push("#compdef ggt");
  lines.push("");

  // check if any flag has a dynamic completer
  const hasDynamicFlags =
    data.rootFlags.some((f) => f.hasCompleter) ||
    data.commands.some((c) => c.flags.some((f) => f.hasCompleter) || c.subcommands.some((s) => s.flags.some((f) => f.hasCompleter)));

  if (hasDynamicFlags) {
    lines.push("_ggt_dynamic() {");
    lines.push("  local -a results");
    lines.push('  results=(${(f)"$(ggt --__complete "${_ggt_words[@]:1}" 2>/dev/null)"})');
    lines.push("  compadd -a results");
    lines.push("}");
    lines.push("");
  }

  // helper functions for commands with subcommands
  for (const cmd of data.commands) {
    if (cmd.subcommands.length > 0) {
      lines.push(...generateSubcommandHelper(cmd, data.rootFlags));
      lines.push("");
    }
  }

  // main _ggt function
  lines.push("_ggt() {");
  lines.push("  local -a commands");
  lines.push("  local state");
  if (hasDynamicFlags) {
    lines.push("  # Save the full word list before _arguments -C locally scopes $words");
    lines.push('  local -a _ggt_words=("${words[@]}")');
  }
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
    for (const alias of cmd.aliases) {
      lines.push(`        '${alias}:${escapeZsh(cmd.description)}'`);
    }
  }
  lines.push("      )");
  lines.push("      _describe -t commands 'ggt command' commands");
  lines.push("      ;;");

  // args state
  lines.push("    args)");
  lines.push("      case $words[1] in");

  for (const cmd of data.commands) {
    if (cmd.subcommands.length > 0) {
      lines.push(`        ${[cmd.name, ...cmd.aliases].join("|")})`);
      lines.push(`          _ggt_${sanitizeName(cmd.name)}`);
      lines.push("          ;;");
    } else {
      const allFlags = [...data.rootFlags, ...cmd.flags];
      lines.push(`        ${[cmd.name, ...cmd.aliases].join("|")})`);
      lines.push("          _arguments \\");
      lines.push(...renderFlagSpecs(allFlags.map((f) => zshFlagSpec(f))));
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
const generateSubcommandHelper = (cmd: CommandDef, rootFlags: FlagDef[]): string[] => {
  const fnName = `_ggt_${sanitizeName(cmd.name)}`;
  const lines: string[] = [];

  lines.push(`${fnName}() {`);
  lines.push("  local -a subcommands");
  lines.push("  local state");
  lines.push("");
  lines.push("  _arguments -C \\");

  const parentFlags = [...rootFlags, ...cmd.flags];
  for (const flag of parentFlags) {
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
    for (const alias of sub.aliases) {
      lines.push(`        '${alias}:${escapeZsh(sub.description)}'`);
    }
  }
  lines.push("      )");
  lines.push(`      _describe -t subcommands '${cmd.name} subcommand' subcommands`);
  lines.push("      ;;");

  lines.push("    args)");
  lines.push("      case $words[1] in");

  for (const sub of cmd.subcommands) {
    const allFlags = [...rootFlags, ...cmd.flags, ...sub.flags];
    lines.push(`        ${[sub.name, ...sub.aliases].join("|")})`);
    if (allFlags.length > 0) {
      lines.push("          _arguments \\");
      lines.push(...renderFlagSpecs(allFlags.map((f) => zshFlagSpec(f))));
    }
    lines.push("          ;;");
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

  // trailing space in ":value: " signals free-form arg to zsh _arguments
  const argSuffix = needsArg ? (flag.hasCompleter ? ":value:_ggt_dynamic" : ":value: ") : "";

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
 * Escapes special characters for zsh completion descriptions.
 *
 * - Single quotes are escaped by ending the string, inserting `\'`, and restarting
 * - Brackets are escaped because they delimit flag descriptions in `_arguments` specs
 * - Colons are escaped because they are significant delimiters in `_arguments`
 *   and `_describe` entries (e.g., `'name:description'`)
 */
const escapeZsh = (str: string): string => {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "'\\''").replace(/\[/g, "\\[").replace(/\]/g, "\\]").replace(/:/g, "\\:");
};

/**
 * Sanitizes a command name for use as a function name (e.g., agent-plugin -> agent_plugin).
 */
const sanitizeName = (name: string): string => {
  return name.replace(/-/g, "_");
};
