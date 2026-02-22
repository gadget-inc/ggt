import arg from "arg";

import { parseArgs, type ArgsDefinition, type ArgsDefinitionResult } from "../services/command/arg.js";
import { Commands, importCommand, isCommand, type Run } from "../services/command/command.js";
import { renderCommandList, renderDetailedUsage, renderShortUsage } from "../services/command/usage.js";
import { verbosityToLevel } from "../services/output/log/level.js";
import { println } from "../services/output/print.js";
import { reportErrorAndExit } from "../services/output/report.js";
import { sprint } from "../services/output/sprint.js";
import { shouldCheckForUpdate } from "../services/output/update.js";
import { sortBySimilar } from "../services/util/collection.js";
import { isNil } from "../services/util/is.js";

export type RootArgs = typeof args;
export type RootArgsResult = ArgsDefinitionResult<RootArgs>;

export const args = {
  "-h": { type: Boolean },
  "--help": { type: Boolean, description: "Print how to use a command" },
  "--verbose": { type: arg.COUNT, alias: ["-v", "--debug"], description: "Print more verbose output" },
  "--telemetry": { type: Boolean, description: "Enable telemetry" },
  "--json": { type: Boolean, description: "Output as JSON" },
} satisfies ArgsDefinition;

export const usage = async (): Promise<string> => {
  const commandList = await renderCommandList();
  return sprint`
    The command-line interface for Gadget.

    {gray Usage}
      ggt [COMMAND]

    {gray Commands}
      ${commandList}

    {gray Flags}
      -h, --help       Print how to use a command
      -v, --verbose    Print more verbose output
          --telemetry  Enable telemetry
          --json       Output as JSON

    {gray Agent plugins}
      Install AGENTS.md and Gadget agent skills for your coding agent:
      {cyanBright ggt agent-plugin install}

    Run "ggt [COMMAND] -h" for more information about a specific command.
  `;
};

export const run: Run<RootArgs> = async (parent, args): Promise<void> => {
  const ctx = parent.child({ name: "root" });

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
    println(await usage());
    process.exit(0);
  }

  // resolve command aliases
  const commandAliases: Record<string, string> = { envs: "env" };
  commandName = commandAliases[commandName] ?? commandName;

  if (!isCommand(commandName)) {
    const [closest] = sortBySimilar(commandName, Commands);
    println`
      Unknown command {yellow ${commandName}}

      Did you mean {blueBright ${closest}}?

      Run {gray ggt --help} for usage
    `;
    process.exit(1);
  }

  const command = await importCommand(commandName);

  if (args["--help"]) {
    if (!command.parseOptions?.permissive || args._.length === 0) {
      println(renderDetailedUsage(commandName, command));
      process.exit(0);
    }
    // pass --help through to the command's run function for subcommand-level help
    args._.push("--help");
  } else if (args["-h"]) {
    if (!command.parseOptions?.permissive || args._.length === 0) {
      println(renderShortUsage(commandName, command));
      process.exit(0);
    }
    // pass -h through to the command's run function for subcommand-level help
    args._.push("-h");
  }

  try {
    await command.run(ctx.child({ name: commandName }), parseArgs(command.args ?? {}, { ...command.parseOptions, argv: args._ }));
  } catch (error) {
    await reportErrorAndExit(ctx, error);
  }
};
