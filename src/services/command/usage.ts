import { template } from "chalk-template";

import type { ArgsDefinition } from "./arg.js";
import type { CommandModule } from "./command.js";

import { extractFlags, type FlagDef } from "./arg.js";
import { Commands, importCommand } from "./command.js";

const flagLeft = (flag: FlagDef): string => {
  const aliasPrefix = flag.aliases.length > 0 ? flag.aliases.join(", ") + ", " : "    ";
  const valueSuffix = flag.type === "boolean" || flag.type === "count" ? "" : " <value>";
  return `${aliasPrefix}${flag.name}${valueSuffix}`;
};

/**
 * Formats a single flag as a padded row for the short help output.
 *
 * Produces lines like:
 *   -a, --app <value>        Select the application
 *       --force              Force the operation
 */
export const formatFlag = (flag: FlagDef, padWidth = 24): string => {
  const left = flagLeft(flag);
  return `  ${left.padEnd(padWidth)}${flag.description}`;
};

/**
 * Builds compact short help output from command metadata.
 *
 * Includes sections for description, usage, commands, flags, examples,
 * and a footer pointing to `--help` for detailed help.
 */
export const renderShortUsage = (commandName: string, mod: CommandModule): string => {
  const lines: string[] = [];

  // description
  if (mod.description) {
    lines.push(mod.description);
    lines.push("");
  }

  // usage line
  const positional = mod.positional ? ` ${mod.positional}` : "";
  lines.push("{gray Usage}");
  lines.push(`  ggt ${commandName}${positional} [options]`);

  // commands section (for commands with subcommands)
  if (mod.subcommandDefs && mod.subcommandDefs.length > 0) {
    lines.push("");
    lines.push("{gray Commands}");
    for (const sub of mod.subcommandDefs) {
      lines.push(`  ${sub.name.padEnd(22)}${sub.description}`);
    }
  }

  // flags section
  if (mod.args) {
    const flags = extractFlags(mod.args);
    if (flags.length > 0) {
      // compute padding: max left-side width + 2 for gutter, minimum 24
      const maxLeft = Math.max(24, ...flags.map((f) => flagLeft(f).length + 2));

      lines.push("");
      lines.push("{gray Flags}");
      for (const flag of flags) {
        lines.push(formatFlag(flag, maxLeft));
      }
    }
  }

  // examples section
  if (mod.examples && mod.examples.length > 0) {
    lines.push("");
    lines.push("{gray Examples}");
    for (const example of mod.examples) {
      lines.push(`  {cyanBright $ ${example}}`);
    }
  }

  // footer
  lines.push("");
  lines.push(`Run "ggt ${commandName} --help" for detailed help.`);

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
export const renderDetailedUsage = (commandName: string, mod: CommandModule): string => {
  const hasExpandedFlags = mod.args && hasLongDescriptions(mod.args);

  if (!mod.longDescription && !mod.sections && !hasExpandedFlags) {
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
    // indent each line of the long description
    for (const line of mod.longDescription.split("\n")) {
      lines.push(line || "");
    }
    lines.push("");
  }

  // usage line
  const positional = mod.positional ? ` ${mod.positional}` : "";
  lines.push("{gray Usage}");
  lines.push(`  ggt ${commandName}${positional} [options]`);

  // commands section (for commands with subcommands)
  if (mod.subcommandDefs && mod.subcommandDefs.length > 0) {
    lines.push("");
    lines.push("{gray Commands}");
    for (const sub of mod.subcommandDefs) {
      lines.push(`  ${sub.name.padEnd(22)}${sub.description}`);
    }
  }

  // flags section
  if (mod.args) {
    const flags = extractFlags(mod.args);
    if (flags.length > 0) {
      lines.push("");
      lines.push("{gray Flags}");

      if (hasExpandedFlags) {
        // expanded format: each flag on its own line with longDescription below
        const maxLeft = Math.max(24, ...flags.map((f) => flagLeft(f).length + 2));

        for (const flag of flags) {
          lines.push(formatFlag(flag, maxLeft));
          const longDesc = flagLongDescription(mod.args, flag.name);
          if (longDesc) {
            for (const descLine of longDesc.split("\n")) {
              lines.push(descLine ? `    ${descLine}` : "");
            }
          }
        }
      } else {
        const maxLeft = Math.max(24, ...flags.map((f) => flagLeft(f).length + 2));
        for (const flag of flags) {
          lines.push(formatFlag(flag, maxLeft));
        }
      }
    }
  }

  // examples section
  if (mod.examples && mod.examples.length > 0) {
    lines.push("");
    lines.push("{gray Examples}");
    for (const example of mod.examples) {
      lines.push(`  {cyanBright $ ${example}}`);
    }
  }

  // titled prose sections
  if (mod.sections) {
    for (const section of mod.sections) {
      lines.push("");
      lines.push(`{gray ${section.title}}`);
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

  for (const cmd of Commands) {
    const mod = await importCommand(cmd);
    if (mod.hidden) {
      continue;
    }
    const description = mod.description ?? "";
    lines.push(`${cmd.padEnd(17)}${description}`);
  }

  return lines.join("\n");
};
