import colors from "../output/colors.js";
import { extractFlags, type ArgsDefinition, type FlagDef } from "./arg.js";
import type { PositionalDef, StoredSubcommand } from "./command.js";

/**
 * Help text style conventions for all commands and shared args:
 *
 * - description: sentence case, no trailing period, imperative present tense,
 *   fits within MIN_FLAG_PAD (24 chars) column budget for flag rows; aim for
 *   under 50 characters.
 *
 * - details: full sentences with trailing period. Multi-line allowed.
 *   Rendered indented at 8 spaces in detailed help output.
 *
 * - valueName: lowercase with hyphens (e.g., "app-slug", "log-level"). No
 *   angle brackets -- the renderer adds them automatically.
 *
 * - examples: bare commands without "$ " prefix (the renderer prepends "  $ ").
 *   Order from common to advanced.
 *
 * - sections: title in title case (the renderer converts it to uppercase). Content uses
 *   full sentences with trailing periods.
 */

/**
 * The fields needed by the usage renderers.
 * Matches the shape of both `LeafCommandConfig` and `ParentCommandConfig`.
 */
export type UsageInput = {
  description: string;
  positionals?: readonly PositionalDef[];
  args?: ArgsDefinition;
  details?: string;
  examples?: readonly string[];
  sections?: readonly { title: string; content: string }[];
  subcommands?: Record<string, StoredSubcommand>;
};

/** Minimum column width for the positional argument name in compact help output. */
const MIN_POSITIONAL_PAD = 12;

/** Minimum column width for the flag left-side text in help output. */
const MIN_FLAG_PAD = 24;

/** Extra padding added to the longest subcommand name for column alignment. */
const COLUMN_PADDING = 4;

/** Total line width for word-wrapping in expanded mode. */
const WRAP_WIDTH = 80;

/** Indentation for description continuation lines in expanded flag/argument blocks. */
const WRAP_INDENT_WIDTH = 8;
const WRAP_INDENT = " ".repeat(WRAP_INDENT_WIDTH);

/**
 * Word-wraps text to fit within a given width, preserving an indent prefix
 * on each line. Returns an array of indented lines.
 */
export const wrapText = (text: string, indent: string, width: number): string[] => {
  const maxContent = width - indent.length;
  const lines: string[] = [];

  for (const [pi, paragraph] of text.split(/\n\n+/).entries()) {
    if (pi > 0) lines.push("");
    if (!paragraph.trim()) {
      continue;
    }

    // Collapse single newlines into spaces so template literals using
    // dedent are treated as a single flowing paragraph.
    const words = paragraph.replace(/\n/g, " ").split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      if (!current) {
        current = word;
        if (word.length > maxContent) {
          lines.push(`${indent}${current}`);
          current = "";
        }
      } else if (word.length > maxContent) {
        // Flush accumulated text, then emit the oversized word on its own line
        lines.push(`${indent}${current}`);
        current = "";
        lines.push(`${indent}${word}`);
      } else if (current.length + 1 + word.length <= maxContent) {
        current += ` ${word}`;
      } else {
        lines.push(`${indent}${current}`);
        current = word;
      }
    }
    if (current) {
      lines.push(`${indent}${current}`);
    }
  }

  return lines;
};

/**
 * Merges a short description and optional details into a single
 * paragraph string. Returns the description unchanged when there are
 * no details; adds a period before joining when details are present.
 */
const mergeDescriptions = (description: string, details?: string): string => {
  if (!details) return description;
  if (!description) return details;
  const withPeriod = description.endsWith(".") ? description : `${description}.`;
  return `${withPeriod} ${details}`;
};

/** Value placeholder, e.g. " <app-slug>", or "" for booleans/counts. */
export const flagValueSuffix = (flag: FlagDef): string => {
  return flag.type === "boolean" || flag.type === "count" ? "" : ` <${flag.valueName ?? "value"}>`;
};

/** Name portion only (aliases + canonical, with indent prefix). */
export const flagNamePrefix = (flag: FlagDef): string => {
  const isShort = (a: string): boolean => /^-[^-]/.test(a);
  const shortAliases = [...flag.aliases.filter(isShort), ...(isShort(flag.name) ? [flag.name] : [])].sort((a, b) => a.length - b.length);
  const longCanonical = flag.name.startsWith("--") ? [flag.name] : [];
  const longRest = flag.aliases.filter((a) => a.startsWith("--")).sort((a, b) => a.length - b.length);
  const longAliases = [...longCanonical, ...longRest];
  const allParts = [...shortAliases, ...longAliases];
  const aliasPrefix = shortAliases.length > 0 ? "" : "    ";
  return `${aliasPrefix}${allParts.join(", ")}`;
};

/** Full unstyled left-side text -- unchanged public API. */
export const flagLeft = (flag: FlagDef): string => `${flagNamePrefix(flag)}${flagValueSuffix(flag)}`;

/**
 * Formats a single flag as a padded row for the short help output.
 * Returns a pre-rendered line (chalk styles already applied) so the
 * result can be interpolated into any template without double-processing.
 *
 * Produces lines like:
 *   -a, --app <name>         Select the application
 *       --force              Force the operation
 */
export const formatFlag = (flag: FlagDef, padWidth = MIN_FLAG_PAD, indent = 2): string => {
  const name = flagNamePrefix(flag);
  const value = flagValueSuffix(flag);
  const unstyledWidth = name.length + value.length;
  const padding = " ".repeat(Math.max(0, padWidth - unstyledWidth));
  const styledName = colors.identifier.bold(name);
  const styledValue = value ? colors.placeholder(value) : "";
  return `${" ".repeat(indent)}${styledName}${styledValue}${padding}${flag.description}`;
};

/** Sorts flags: short-alias flags first (by alias letter), then long-only (alphabetical). */
const sortFlags = (flags: FlagDef[]): FlagDef[] => {
  return [...flags].sort((a, b) => {
    const aShort = a.aliases.find((x) => /^-[^-]/.test(x)) ?? (a.name.length === 2 && a.name.startsWith("-") ? a.name : null);
    const bShort = b.aliases.find((x) => /^-[^-]/.test(x)) ?? (b.name.length === 2 && b.name.startsWith("-") ? b.name : null);
    if (aShort && !bShort) return -1;
    if (!aShort && bShort) return 1;
    if (aShort && bShort) return aShort.localeCompare(bShort);
    return a.name.localeCompare(b.name);
  });
};

/**
 * Appends the description block (and optionally details) to the output lines.
 */
const renderDescription = (lines: string[], mod: UsageInput): void => {
  lines.push(mod.description);
  lines.push("");

  const long = mod.details;
  if (long) {
    for (const line of long.split("\n")) {
      lines.push(line ? line : "");
    }
    lines.push("");
  }
};

/**
 * Appends the USAGE header and usage line.
 */
const positionalPlaceholder = (p: PositionalDef): string => {
  if (p.placeholder) return p.placeholder;
  return p.required ? `<${p.name}>` : `[${p.name}]`;
};

const renderUsageLine = (lines: string[], commandName: string, mod: UsageInput, flags: FlagDef[]): void => {
  const subcommandSlot = mod.subcommands && Object.keys(mod.subcommands).length > 0 ? " <command>" : "";
  const positionalStr = mod.positionals?.map((p) => positionalPlaceholder(p)).join(" ");
  const positional = positionalStr ? ` ${positionalStr}` : "";
  const flagsSuffix = flags.length > 0 ? " [flags]" : "";
  lines.push(colors.header("USAGE"));
  lines.push(`  ggt ${commandName}${subcommandSlot}${positional}${flagsSuffix}`);
};

/**
 * Appends the ARGUMENTS section in either compact or expanded mode.
 */
const renderArguments = (lines: string[], mod: UsageInput, opts: { expanded: boolean }): void => {
  const positionalArgs = mod.positionals;
  if (!positionalArgs || positionalArgs.length === 0) {
    return;
  }

  lines.push("");
  lines.push(colors.header("ARGUMENTS"));

  if (opts.expanded) {
    for (const [i, arg] of positionalArgs.entries()) {
      if (i > 0) {
        lines.push("");
      }
      lines.push(`  ${colors.identifier.bold(arg.name)}`);
      const merged = mergeDescriptions(arg.description ?? "", arg.details);
      for (const wrappedLine of wrapText(merged, WRAP_INDENT, WRAP_WIDTH)) {
        lines.push(wrappedLine);
      }
    }
  } else {
    const maxName = Math.max(MIN_POSITIONAL_PAD, ...positionalArgs.map((a) => a.name.length + COLUMN_PADDING));
    for (const arg of positionalArgs) {
      const padding = " ".repeat(Math.max(0, maxName - arg.name.length));
      lines.push(`  ${colors.identifier.bold(arg.name)}${padding}${arg.description ?? ""}`);
    }
  }
};

/**
 * Appends the COMMANDS section for commands with subcommands.
 * Reads directly from the `subcommands` record.
 */
const renderCommands = (lines: string[], mod: UsageInput): void => {
  if (!mod.subcommands) {
    return;
  }

  const entries = Object.entries(mod.subcommands);
  if (entries.length === 0) {
    return;
  }

  const maxSub = Math.max(...entries.map(([name]) => name.length)) + COLUMN_PADDING;
  lines.push("");
  lines.push(colors.header("COMMANDS"));
  for (const [name, sub] of entries) {
    const padding = " ".repeat(Math.max(0, maxSub - name.length));
    lines.push(`  ${colors.identifier.bold(name)}${padding}${sub.description}`);
  }
};

/**
 * Appends a flags section in either compact or expanded mode.
 * In expanded mode, reads `details` directly from each FlagDef.
 *
 * @param heading - Section heading (default: "FLAGS")
 */
const renderFlags = (lines: string[], flags: FlagDef[], opts: { expanded: boolean; heading?: string }): void => {
  if (flags.length === 0) {
    return;
  }

  lines.push("");
  lines.push(colors.header(opts.heading ?? "FLAGS"));

  if (opts.expanded) {
    for (const [i, flag] of flags.entries()) {
      if (i > 0) {
        lines.push("");
      }
      const name = flagNamePrefix(flag);
      const value = flagValueSuffix(flag);
      const styledLeft = `${colors.identifier.bold(name)}${value ? colors.placeholder(value) : ""}`;
      lines.push(`  ${styledLeft}`);
      const merged = mergeDescriptions(flag.description, flag.details);
      for (const wrappedLine of wrapText(merged, WRAP_INDENT, WRAP_WIDTH)) {
        lines.push(wrappedLine);
      }
    }
  } else {
    const maxLeft = Math.max(MIN_FLAG_PAD, ...flags.map((f) => flagLeft(f).length + 2));
    for (const flag of flags) {
      lines.push(formatFlag(flag, maxLeft));
    }
  }
};

/**
 * Appends the EXAMPLES section.
 */
const renderExamples = (lines: string[], mod: UsageInput): void => {
  if (!mod.examples || mod.examples.length === 0) {
    return;
  }

  lines.push("");
  lines.push(colors.header("EXAMPLES"));
  for (const example of mod.examples) {
    lines.push(`  ${colors.prompt("$")} ${example}`);
  }
};

/**
 * Builds compact short help output from command metadata.
 *
 * Includes sections for description, usage, arguments, commands, flags,
 * examples, and a footer pointing to `--help` for more information.
 */
export const renderShortUsage = (commandName: string, mod: UsageInput, options?: { footer?: boolean; flags?: FlagDef[] }): string => {
  const lines: string[] = [];
  const allFlags = options?.flags ?? (mod.args ? extractFlags(mod.args) : []);

  // pass only description (no details) for short help
  renderDescription(lines, { description: mod.description });
  const visibleFlags = sortFlags(allFlags.filter((f) => !f.hidden));
  const briefFlags = visibleFlags.filter((f) => f.brief !== false);
  // usage line uses all visible flags (brief: false flags are still parseable)
  renderUsageLine(lines, commandName, mod, visibleFlags);
  renderArguments(lines, mod, { expanded: false });
  renderCommands(lines, mod);
  renderFlags(lines, briefFlags, { expanded: false });
  renderExamples(lines, mod);

  // footer
  if (options?.footer !== false && hasDetailedContent(mod, visibleFlags)) {
    lines.push("");
    lines.push(`Run ${colors.hint(`ggt ${commandName} --help`)} for more information.`);
  }

  return lines.join("\n");
};

/**
 * Returns true when a command has content that only appears in `--help`
 * output (details, sections, or flag/positionalArg details).
 */
export const hasDetailedContent = (mod: UsageInput, flags?: FlagDef[]): boolean => {
  const resolvedFlags = flags ?? (mod.args ? extractFlags(mod.args) : []);
  return !!(
    mod.details ||
    mod.sections?.length ||
    resolvedFlags.some((f) => f.details) ||
    resolvedFlags.some((f) => f.brief === false) ||
    mod.positionals?.some((a) => a.details)
  );
};

/**
 * Builds a compact usage hint with the usage line and a pointer to `-h`.
 *
 * Useful for error messages where full help is too verbose but a usage
 * reminder is helpful.
 */
export const renderUsageHint = (commandName: string, mod: UsageInput): string => {
  const allFlags = mod.args ? extractFlags(mod.args) : [];
  const flags = sortFlags(allFlags.filter((f) => !f.hidden));
  const lines: string[] = [];

  renderUsageLine(lines, commandName, mod, flags);
  lines.push("");
  lines.push(`Run ${colors.hint(`ggt ${commandName} -h`)} for more information.`);

  return lines.join("\n");
};

/**
 * Builds detailed help output from command metadata.
 *
 * Starts with the short help from {@link renderShortUsage}, then appends
 * the long description, expanded flags with long descriptions, and
 * titled prose sections.
 */
export const renderDetailedUsage = (commandName: string, mod: UsageInput): string => {
  const allFlags = mod.args ? extractFlags(mod.args) : [];
  const flags = sortFlags(allFlags.filter((f) => !f.hidden));
  if (!hasDetailedContent(mod, flags)) {
    return renderShortUsage(commandName, mod, { footer: false, flags: allFlags });
  }

  const briefFlags = flags.filter((f) => f.brief !== false);
  const additionalFlags = flags.filter((f) => f.brief === false);

  const lines: string[] = [];

  renderDescription(lines, mod);
  renderUsageLine(lines, commandName, mod, flags);
  renderArguments(lines, mod, { expanded: true });
  renderCommands(lines, mod);
  renderFlags(lines, briefFlags, { expanded: true });
  renderFlags(lines, additionalFlags, { expanded: true, heading: "ADDITIONAL FLAGS" });
  renderExamples(lines, mod);

  // titled prose sections
  if (mod.sections) {
    for (const section of mod.sections) {
      lines.push("");
      lines.push(colors.header(section.title.toUpperCase()));
      for (const line of section.content.split("\n")) {
        lines.push(line ? `  ${line}` : "");
      }
    }
  }

  return lines.join("\n");
};
