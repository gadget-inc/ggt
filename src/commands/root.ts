import arg from "arg";
import type { EmptyObject } from "type-fest";
import type { ArgsDefinition } from "../services/command/arg.js";
import { Commands, importCommand, isAvailableCommand, type Command, type Usage } from "../services/command/command.js";
import { verbosityToLevel } from "../services/output/log/level.js";
import { reportErrorAndExit } from "../services/output/report.js";
import { sprint } from "../services/output/sprint.js";
import { warnIfUpdateAvailable } from "../services/output/update.js";
import { sortBySimilar } from "../services/util/collection.js";
import { isNil } from "../services/util/is.js";

export const usage: Usage = () => {
  return sprint`
    The command-line interface for Gadget.

    {bold USAGE}
      ggt [COMMAND]

    {bold COMMANDS}
      sync           Sync your Gadget application's source code
      push           Push your local file changes to Gadget
      pull           Pull Gadget's file changes to your local filesystem
      list           List your apps
      login          Log in to your account
      logout         Log out of your account
      whoami         Print the currently logged in account
      version        Print the version of ggt

    {bold FLAGS}
      -h, --help     Print command's usage
      -v, --verbose  Print verbose output
          --json     Print output as JSON

    Use "ggt [COMMAND] --help" for more information about a specific command.
  `;
};

export const args = {
  "-h": { type: Boolean },
  "--help": { type: Boolean },
  "--verbose": { type: arg.COUNT, alias: ["-v", "--debug"] },
  "--json": { type: Boolean },
} satisfies ArgsDefinition;

export type RootArgs = typeof args;

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

  const cmd = ctx.args._.shift();
  if (isNil(cmd)) {
    ctx.log.println(usage(ctx));
    process.exit(0);
  }

  if (!isAvailableCommand(cmd)) {
    const [closest] = sortBySimilar(cmd, Commands);
    ctx.log.println`
      Unknown command {yellow ${cmd}}

      Did you mean {blueBright ${closest}}?

      Run {gray ggt --help} for usage
    `;
    process.exit(1);
  }

  const subcommand = await importCommand(cmd);

  if (ctx.args["-h"] ?? ctx.args["--help"]) {
    ctx.log.println(subcommand.usage(ctx));
    process.exit(0);
  }

  try {
    await subcommand.command(ctx.child({ name: cmd, parse: subcommand.args }));
  } catch (error) {
    await reportErrorAndExit(ctx, error);
  }
};
