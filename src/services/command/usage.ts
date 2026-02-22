import { template } from "chalk-template";

import type { ArgsDefinition } from "./arg.js";
import type { PositionalArgDef, SubcommandDef } from "./command.js";

import { extractFlags, type FlagDef } from "./arg.js";
import { Commands, importCommand } from "./command.js";

/**
 * The subset of {@link CommandModule} fields needed by the usage renderers.
 * Excludes `run` to avoid type variance issues with specific arg types.
 */
type CommandMetadata = {
  description?: string;
  args?: ArgsDefinition;
  subcommandDefs?: readonly SubcommandDef[];
  examples?: readonly string[];
  positional?: string;
  positionalArgs?: readonly PositionalArgDef[];
  longDescription?: string;
  sections?: readonly { title: string; content: string }[];
};

const flagLeft = (flag: FlagDef): string => {
  const shortAliases = flag.aliases.filter((a) => /^-[^-]/.test(a));
  const aliasPrefix = shortAliases.length > 0 ? shortAliases.join(", ") + ", " : "    ";
  const valueSuffix = flag.type === "boolean" || flag.type === "count" ? "" : ` <${flag.valueName ?? "value"}>`;
  return `${aliasPrefix}${flag.name}${valueSuffix}`;
};

/**
 * Formats a single flag as a padded row for the short help output.
 *
 * Produces lines like:
 *   -a, --app <name>         Select the application
 *       --force              Force the operation
 */
export const formatFlag = (flag: FlagDef, padWidth = 24): string => {
  const left = flagLeft(flag);
  return `  ${left.padEnd(padWidth)}${flag.description}`;
};

/**
 * Builds compact short help output from command metadata.
 *
 * Includes sections for description, usage, arguments, commands, flags,
 * examples, and a footer pointing to `--help` for more information.
 */
export const renderShortUsage = (commandName: string, mod: CommandMetadata): string => {
  const lines: string[] = [];

  // description
  if (mod.description) {
    lines.push(mod.description);
    lines.push("");
  }

  // usage line
  const positional = mod.positional ? ` ${mod.positional}` : "";
  const flags = mod.args ? extractFlags(mod.args) : [];
  const flagsSuffix = flags.length > 0 ? " [flags]" : "";
  lines.push("{bold USAGE}");
  lines.push(`  ggt ${commandName}${positional}${flagsSuffix}`);

  // arguments section
  if (mod.positionalArgs && mod.positionalArgs.length > 0) {
    const maxName = Math.max(12, ...mod.positionalArgs.map((a) => a.name.length + 4));
    lines.push("");
    lines.push("{bold ARGUMENTS}");
    for (const arg of mod.positionalArgs) {
      lines.push(`  ${arg.name.padEnd(maxName)}${arg.description ?? ""}`);
    }
  }

  // commands section (for commands with subcommands)
  if (mod.subcommandDefs && mod.subcommandDefs.length > 0) {
    const maxSub = Math.max(...mod.subcommandDefs.map((s) => s.name.length)) + 4;
    lines.push("");
    lines.push("{bold COMMANDS}");
    for (const sub of mod.subcommandDefs) {
      lines.push(`  ${sub.name.padEnd(maxSub)}${sub.description}`);
    }
  }

  // flags section
  if (flags.length > 0) {
    // compute padding: max left-side width + 2 for gutter, minimum 24
    const maxLeft = Math.max(24, ...flags.map((f) => flagLeft(f).length + 2));

    lines.push("");
    lines.push("{bold FLAGS}");
    for (const flag of flags) {
      lines.push(formatFlag(flag, maxLeft));
    }
  }

  // examples section
  if (mod.examples && mod.examples.length > 0) {
    lines.push("");
    lines.push("{bold EXAMPLES}");
    for (const example of mod.examples) {
      lines.push(`  $ ${example}`);
    }
  }

  // footer
  lines.push("");
  lines.push(`Run "ggt ${commandName} --help" for more information.`);

  return template(lines.join("\n"));
};

/**
 * Checks whether any flag in an args definition has a longDescription.
 */
const hasLongDescriptions = (args: ArgsDefinition): boolean => {
  for (const value of Object.values(args)) {
    if (typeof value === "object" && "longDescription" in value && value.longDescription) {
      return true;
    }
  }
  return false;
};

/**
 * Extracts the longDescription for a flag from the raw args definition.
 */
const flagLongDescription = (args: ArgsDefinition, flagName: string): string | undefined => {
  const def = args[flagName];
  if (typeof def === "object" && "longDescription" in def) {
    return def.longDescription;
  }
  return undefined;
};

/**
 * Builds detailed help output from command metadata.
 *
 * Starts with the short help from {@link renderShortUsage}, then appends
 * the long description, expanded flags with long descriptions, and
 * titled prose sections.
 */
export const renderDetailedUsage = (commandName: string, mod: CommandMetadata): string => {
  const hasExpandedFlags = mod.args && hasLongDescriptions(mod.args);
  const hasExpandedPositionalArgs = mod.positionalArgs?.some((a) => a.longDescription);

  if (!mod.longDescription && !mod.sections && !hasExpandedFlags && !hasExpandedPositionalArgs) {
    return renderShortUsage(commandName, mod);
  }

  const lines: string[] = [];

  // description
  if (mod.description) {
    lines.push(mod.description);
    lines.push("");
  }

  // long description
  if (mod.longDescription) {
    for (const line of mod.longDescription.split("\n")) {
      lines.push(line || "");
    }
    lines.push("");
  }

  // usage line
  const positional = mod.positional ? ` ${mod.positional}` : "";
  const flags = mod.args ? extractFlags(mod.args) : [];
  const flagsSuffix = flags.length > 0 ? " [flags]" : "";
  lines.push("{bold USAGE}");
  lines.push(`  ggt ${commandName}${positional}${flagsSuffix}`);

  // arguments section (expanded in detailed mode)
  if (mod.positionalArgs && mod.positionalArgs.length > 0) {
    lines.push("");
    lines.push("{bold ARGUMENTS}");

    if (hasExpandedPositionalArgs) {
      // expanded: name as header, description indented below
      lines.push("");
      for (const [i, arg] of mod.positionalArgs.entries()) {
        lines.push(`  ${arg.name}`);
        const desc = arg.longDescription ?? arg.description;
        if (desc) {
          for (const descLine of desc.split("\n")) {
            lines.push(descLine ? `    ${descLine}` : "");
          }
        }
        if (i < mod.positionalArgs.length - 1) {
          lines.push("");
        }
      }
    } else {
      // compact: same as short help
      const maxName = Math.max(12, ...mod.positionalArgs.map((a) => a.name.length + 4));
      for (const arg of mod.positionalArgs) {
        lines.push(`  ${arg.name.padEnd(maxName)}${arg.description ?? ""}`);
      }
    }
  }

  // commands section (for commands with subcommands)
  if (mod.subcommandDefs && mod.subcommandDefs.length > 0) {
    const maxSub = Math.max(...mod.subcommandDefs.map((s) => s.name.length)) + 4;
    lines.push("");
    lines.push("{bold COMMANDS}");
    for (const sub of mod.subcommandDefs) {
      lines.push(`  ${sub.name.padEnd(maxSub)}${sub.description}`);
    }
  }

  // flags section
  if (flags.length > 0) {
    lines.push("");
    lines.push("{bold FLAGS}");

    const maxLeft = Math.max(24, ...flags.map((f) => flagLeft(f).length + 2));

    if (hasExpandedFlags) {
      // expanded: each flag as header with longDescription below, blank lines between
      lines.push("");
      for (const [i, flag] of flags.entries()) {
        const longDesc = mod.args ? flagLongDescription(mod.args, flag.name) : undefined;
        if (longDesc) {
          lines.push(`  ${flagLeft(flag)}`);
          for (const descLine of longDesc.split("\n")) {
            lines.push(descLine ? `    ${descLine}` : "");
          }
        } else {
          lines.push(formatFlag(flag, maxLeft));
        }
        if (i < flags.length - 1) {
          lines.push("");
        }
      }
    } else {
      for (const flag of flags) {
        lines.push(formatFlag(flag, maxLeft));
      }
    }
  }

  // examples section
  if (mod.examples && mod.examples.length > 0) {
    lines.push("");
    lines.push("{bold EXAMPLES}");
    for (const example of mod.examples) {
      lines.push(`  $ ${example}`);
    }
  }

  // titled prose sections
  if (mod.sections) {
    for (const section of mod.sections) {
      lines.push("");
      lines.push(`{bold ${section.title.toUpperCase()}}`);
      for (const line of section.content.split("\n")) {
        lines.push(line ? `  ${line}` : "");
      }
    }
  }

  return template(lines.join("\n"));
};

/**
 * Builds a formatted command list by importing all commands and filtering
 * out hidden ones. Returns just the command lines (not the full root help).
 */
export const renderCommandList = async (): Promise<string> => {
  const lines: string[] = [];
  const maxCmd = Math.max(...Commands.map((c) => c.length)) + 4;

  for (const cmd of Commands) {
    const mod = await importCommand(cmd);
    if (mod.hidden) {
      continue;
    }
    const description = mod.description ?? "";
    lines.push(`${cmd.padEnd(maxCmd)}${description}`);
  }

  return lines.join("\n");
};
