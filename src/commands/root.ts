import arg from "arg";

import { extractFlags, hidden, type ArgsDefinition, type ArgsDefinitionResult, type FlagDef } from "../services/command/arg.js";
import { Commands, importCommand, isCommand, renderCommandList, resolveCommandAlias } from "../services/command/command.js";
import type { Context } from "../services/command/context.js";
import { runCommand } from "../services/command/run.js";
import { flagLeft, flagNamePrefix, flagValueSuffix, formatFlag, wrapText } from "../services/command/usage.js";
import colors from "../services/output/colors.js";
import { verbosityToLevel } from "../services/output/log/level.js";
import { println } from "../services/output/print.js";
import { reportErrorAndExit } from "../services/output/report.js";
import { setSentryTags } from "../services/output/sentry.js";
import { sprint } from "../services/output/sprint.js";
import { shouldCheckForUpdate } from "../services/output/update.js";
import { closestMatch } from "../services/util/collection.js";
import { isNil } from "../services/util/is.js";
import { packageJson } from "../services/util/package-json.js";

export type RootArgs = typeof args;
export type RootArgsResult = ArgsDefinitionResult<RootArgs>;

// root.ts is intentionally not converted to defineCommand because it is the
// dispatch entry point that resolves and delegates to sub-commands, not a
// standard sub-command itself.
export const args = {
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
    description: "",
  },
} satisfies ArgsDefinition;

export const usage = async (helpLevel: "-h" | "--help" = "-h"): Promise<string> => {
  const commandList = await renderCommandList();

  const flags = extractFlags(args).filter((f) => !f.hidden);
  let flagLines: string;

  if (helpLevel === "--help") {
    flagLines = renderExpandedFlags(flags);
  } else {
    const maxLeft = Math.max(0, ...flags.map((f) => flagLeft(f).length + 2));
    flagLines = flags.map((f) => formatFlag(f, maxLeft, 0)).join("\n");
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

export const run = async (parent: Context, args: RootArgsResult): Promise<void> => {
  const ctx = parent.child({ name: "root" });

  if (args["--__complete"]) {
    const { handleCompletionRequest } = await import("../services/completion/handler.js");
    await handleCompletionRequest(ctx, args._);
    process.exit(0);
  }

  if (args["--version"]) {
    println(packageJson.version);
    process.exit(0);
  }

  if (args["--json"]) {
    process.env["GGT_LOG_FORMAT"] = "json";
  }

  if (args["--verbose"]) {
    process.env["GGT_LOG_LEVEL"] = verbosityToLevel(args["--verbose"]).toString();
  }

  if (await shouldCheckForUpdate(ctx)) {
    const { warnIfUpdateAvailable } = await import("../services/output/update.js");
    await warnIfUpdateAvailable(ctx);
  }

  let commandName = args._.shift();
  if (isNil(commandName)) {
    const helpLevel = args["--help"] ? (process.argv.includes("-h") && !process.argv.includes("--help") ? "-h" : "--help") : "-h";
    println(await usage(helpLevel));
    process.exit(0);
  }

  // handle `ggt help [command]`
  if (commandName === "help") {
    const helpTarget = args._.shift();
    if (isNil(helpTarget)) {
      println(await usage("--help"));
      process.exit(0);
    }
    // treat as `ggt <command> --help`
    commandName = helpTarget;
    args["--help"] = true;
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
  const helpFlag = args["--help"] ? (process.argv.includes("-h") && !process.argv.includes("--help") ? "-h" : "--help") : undefined;
  if (helpFlag) {
    await runCommand(ctx.child({ name: command.name }), command, helpFlag, ...args._);
    return;
  }

  try {
    await runCommand(ctx.child({ name: command.name }), command, ...args._);
  } catch (error) {
    await reportErrorAndExit(ctx, error);
  }
};
