import arg from "arg";
import type { EmptyObject } from "type-fest";
import type { ArgsDefinition } from "../services/command/arg.js";
import { Commands, importCommand, isAvailableCommand, type Command, type Usage } from "../services/command/command.js";
import { verbosityToLevel } from "../services/output/log/level.js";
import { println } from "../services/output/print.js";
import { reportErrorAndExit } from "../services/output/report.js";
import { sprint } from "../services/output/sprint.js";
import { warnIfUpdateAvailable } from "../services/output/update.js";
import { sortBySimilar } from "../services/util/collection.js";
import { isNil } from "../services/util/is.js";

export type RootArgs = typeof args;

export const args = {
  "-h": { type: Boolean },
  "--help": { type: Boolean },
  "--verbose": { type: arg.COUNT, alias: ["-v", "--debug"] },
  "--telemetry": { type: Boolean },
  "--json": { type: Boolean },
} satisfies ArgsDefinition;

export const usage: Usage = () => {
  return sprint`
    The command-line interface for Gadget.

    {bold USAGE}
      ggt [COMMAND]

    {bold COMMANDS}
      dev              Start developing your application
      deploy           Deploy your environment to production
      status           Show your local and environment's file changes
      push             Push your local files to your environment
      pull             Pull your environment's files to your local computer
      open             Open a Gadget location in your browser
      list             List your available applications
      login            Log in to your account
      logout           Log out of your account
      whoami           Print the currently logged in account
      version          Print this version of ggt

    {bold FLAGS}
      -h, --help       Print how to use a command
      -v, --verbose    Print more verbose output
          --telemetry  Enable telemetry

    Run "ggt [COMMAND] -h" for more information about a specific command.
  `;
};

export const command: Command<EmptyObject, EmptyObject> = async (parent): Promise<void> => {
  const ctx = parent.child({
    name: "root",
    parse: args,
    argv: process.argv.slice(2),
    permissive: true,
  });

  if (ctx.args["--json"]) {
    process.env["GGT_LOG_FORMAT"] = "json";
  }

  if (ctx.args["--verbose"]) {
    process.env["GGT_LOG_LEVEL"] = verbosityToLevel(ctx.args["--verbose"]).toString();
  }

  await warnIfUpdateAvailable(ctx);

  let cmd = ctx.args._.shift();
  if (isNil(cmd)) {
    println(usage(ctx));
    process.exit(0);
  }

  if (cmd === "sync") {
    ctx.log.debug('renaming "sync" to "dev" for backwards compatibility');
    cmd = "dev";
  }

  if (!isAvailableCommand(cmd)) {
    const [closest] = sortBySimilar(cmd, Commands);
    println`
      Unknown command {yellow ${cmd}}

      Did you mean {blueBright ${closest}}?

      Run {gray ggt --help} for usage
    `;
    process.exit(1);
  }

  const subcommand = await importCommand(cmd);

  if (ctx.args["-h"] ?? ctx.args["--help"]) {
    println(subcommand.usage(ctx));
    process.exit(0);
  }

  try {
    await subcommand.command(ctx.child({ command: cmd, name: cmd, parse: subcommand.args }));
  } catch (error) {
    await reportErrorAndExit(ctx, error);
  }
};
