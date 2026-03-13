import arg from "arg";

import { Commands, importCommand, isCommand, renderCommandList, resolveCommandAlias } from "../services/command/command.ts";
import type { Context } from "../services/command/context.ts";
import { extractFlags, hidden, type FlagsDefinition, type FlagsResult, type FlagDef } from "../services/command/flag.ts";
import { runCommand } from "../services/command/run.ts";
import { flagLeft, flagNamePrefix, flagValueSuffix, formatFlag, wrapText } from "../services/command/usage.ts";
import colors from "../services/output/colors.ts";
import { verbosityToLevel } from "../services/output/log/level.ts";
import { println } from "../services/output/print.ts";
import { reportErrorAndExit } from "../services/output/report.ts";
import { setSentryTags } from "../services/output/sentry.ts";
import { sprint } from "../services/output/sprint.ts";
import { shouldCheckForUpdate } from "../services/output/update.ts";
import { closestMatch } from "../services/util/collection.ts";
import { isNil } from "../services/util/is.ts";
import { packageJson } from "../services/util/package-json.ts";

export type RootFlags = typeof flags;
export type RootFlagsResult = FlagsResult<RootFlags>;

// root.ts is intentionally not converted to defineCommand because it is the
// dispatch entry point that resolves and delegates to sub-commands, not a
// standard sub-command itself.
export const flags = {
  "--help": {
    type: Boolean,
    alias: "-h",
    description: "Show command help",
    details: "Use -h for a compact summary. Use --help for expanded descriptions including flag details.",
  },
  "--version": {
    type: Boolean,
    description: "Print the ggt version",
    details: "Prints the currently installed ggt version string and exits. Same output as ggt version.",
  },
  "--verbose": {
    type: arg.COUNT,
    alias: ["-v", hidden("--debug")],
    description: "Increase output verbosity (-vv for debug, -vvv for trace)",
    details: "Each -v increases the log level: -v shows info messages, -vv enables debug output, and -vvv enables full trace logging.",
  },
  "--telemetry": {
    type: Boolean,
    description: "Enable telemetry",
    details: "Sends anonymous error reports to help improve ggt. Enabled by default. Use ggt configure to persist this setting.",
  },
  "--json": {
    type: Boolean,
    description: "Output as JSON where supported",
    details:
      "Formats all output as newline-delimited JSON instead of human-readable text. Useful for scripting and piping ggt output to other tools.",
  },
  "--__complete": {
    type: Boolean,
    hidden: true,
  },
} satisfies FlagsDefinition;

export const usage = async (helpLevel: "-h" | "--help" = "-h"): Promise<string> => {
  const commandList = await renderCommandList();

  const visibleFlags = extractFlags(flags).filter((f) => !f.hidden);
  let flagLines: string;

  if (helpLevel === "--help") {
    flagLines = renderExpandedFlags(visibleFlags);
  } else {
    const maxLeft = Math.max(0, ...visibleFlags.map((f) => flagLeft(f).length + 2));
    flagLines = visibleFlags.map((f) => formatFlag(f, maxLeft, 0)).join("\n");
  }

  return sprint`
    The command-line interface for Gadget.

    ${colors.header("USAGE")}
      ggt [command]

    ${colors.header("COMMANDS")}
      ${commandList}

    ${colors.header("FLAGS")}
      ${flagLines}

    Use ${colors.hint("-h")} for a summary, ${colors.hint("--help")} for full details.

    Documentation: https://docs.gadget.dev/guides/cli
    Issues:        https://github.com/gadget-inc/ggt/issues
  `;
};

const renderExpandedFlags = (flags: FlagDef[]): string => {
  return flags
    .map((f) => {
      const name = flagNamePrefix(f);
      const value = flagValueSuffix(f);
      const styledLeft = `${colors.identifier.bold(name)}${value ? colors.placeholder(value) : ""}`;
      let desc = f.description;
      if (f.details) {
        desc = `${desc.endsWith(".") ? desc : `${desc}.`} ${f.details}`;
      }
      const wrapped = wrapText(desc, " ".repeat(8), 80).join("\n");
      return `  ${styledLeft}\n${wrapped}`;
    })
    .join("\n\n");
};

export const run = async (parent: Context, rootFlags: RootFlagsResult): Promise<void> => {
  const ctx = parent.child({ name: "root" });

  if (rootFlags["--__complete"]) {
    const { handleCompletionRequest } = await import("../services/completion/handler.ts");
    await handleCompletionRequest(ctx, rootFlags._);
    process.exit(0);
  }

  if (rootFlags["--version"]) {
    println(packageJson.version);
    process.exit(0);
  }

  if (rootFlags["--json"]) {
    process.env["GGT_LOG_FORMAT"] = "json";
  }

  if (rootFlags["--verbose"]) {
    process.env["GGT_LOG_LEVEL"] = verbosityToLevel(rootFlags["--verbose"]).toString();
  }

  if (await shouldCheckForUpdate(ctx)) {
    const { warnIfUpdateAvailable } = await import("../services/output/update.ts");
    await warnIfUpdateAvailable(ctx);
  }

  let commandName = rootFlags._.shift();
  if (isNil(commandName)) {
    const helpLevel = rootFlags["--help"] ? (process.argv.includes("-h") && !process.argv.includes("--help") ? "-h" : "--help") : "-h";
    println(await usage(helpLevel));
    process.exit(0);
  }

  // handle `ggt help [command]`
  if (commandName === "help") {
    const helpTarget = rootFlags._.shift();
    if (isNil(helpTarget)) {
      println(await usage("--help"));
      process.exit(0);
    }
    // treat as `ggt <command> --help`
    commandName = helpTarget;
    rootFlags["--help"] = true;
  }

  if (!isCommand(commandName)) {
    // Try to resolve as a command alias
    const resolved = await resolveCommandAlias(commandName);
    if (resolved) {
      commandName = resolved;
    }
  }

  if (!isCommand(commandName)) {
    println`
      Unknown command ${colors.warning(commandName)}

      Did you mean ${colors.identifier(closestMatch(commandName, Commands))}?

      Run ${colors.hint("ggt --help")} for usage
    `;
    process.exit(1);
  }

  const command = await importCommand(commandName);
  setSentryTags({ command: commandName });

  // handle root-level help flags before the error-catching boundary so
  // process.exit(0) is not caught and misinterpreted as a command failure
  const helpFlag = rootFlags["--help"] ? (process.argv.includes("-h") && !process.argv.includes("--help") ? "-h" : "--help") : undefined;
  if (helpFlag) {
    await runCommand(ctx.child({ name: command.name }), command, helpFlag, ...rootFlags._);
    return;
  }

  try {
    await runCommand(ctx.child({ name: command.name }), command, ...rootFlags._);
  } catch (error) {
    await reportErrorAndExit(ctx, error);
  }
};
