import arg from "arg";
import { parseArgs, type ArgsDefinition, type ArgsDefinitionResult } from "../services/command/arg.js";
import { Commands, importCommand, isCommand, setCurrentCommand, type Run, type Usage } from "../services/command/command.js";
import { verbosityToLevel } from "../services/output/log/level.js";
import { println } from "../services/output/print.js";
import { reportErrorAndExit } from "../services/output/report.js";
import { sprint } from "../services/output/sprint.js";
import { warnIfUpdateAvailable } from "../services/output/update.js";
import { sortBySimilar } from "../services/util/collection.js";
import { isNil } from "../services/util/is.js";

export type RootArgs = typeof args;
export type RootArgsResult = ArgsDefinitionResult<RootArgs>;

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

    {gray Usage}
      ggt [COMMAND]

    {gray Commands}
      dev              Start developing your application
      deploy           Deploy your environment to production
      status           Show your local and environment's file changes
      push             Push your local files to your environment
      pull             Pull your environment's files to your local computer
      add              Add models, fields, actions and routes to your app
      open             Open a Gadget location in your browser
      list             List your available applications
      login            Log in to your account
      logout           Log out of your account
      whoami           Print the currently logged in account
      version          Print this version of ggt

    {gray Flags}
      -h, --help       Print how to use a command
      -v, --verbose    Print more verbose output
          --telemetry  Enable telemetry

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

  await warnIfUpdateAvailable(ctx);

  let commandName = args._.shift();
  if (isNil(commandName)) {
    println(usage(ctx));
    process.exit(0);
  }

  if (commandName === "sync") {
    ctx.log.debug('renaming "sync" to "dev" for backwards compatibility');
    commandName = "dev";
  }

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
  setCurrentCommand(ctx, commandName);

  if (args["-h"] ?? args["--help"]) {
    println(command.usage(ctx));
    process.exit(0);
  }

  try {
    await command.run(ctx.child({ name: commandName }), parseArgs(command.args ?? {}, { argv: args._ }));
  } catch (error) {
    await reportErrorAndExit(ctx, error);
  }
};
