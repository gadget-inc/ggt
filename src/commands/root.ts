import arg from "arg";
import ms from "ms";
import type { ArgsSpec } from "../services/command/arg.js";
import { AvailableCommands, importCommand, isAvailableCommand, type Usage } from "../services/command/command.js";
import { Context } from "../services/command/context.js";
import { verbosityToLevel } from "../services/output/log/level.js";
import { createLogger } from "../services/output/log/logger.js";
import { reportErrorAndExit } from "../services/output/report.js";
import { sprint } from "../services/output/sprint.js";
import { warnIfUpdateAvailable } from "../services/output/update.js";
import { sortBySimilar } from "../services/util/collection.js";
import { isNil } from "../services/util/is.js";

const log = createLogger({ name: "root" });

export const rootUsage: Usage = () => sprint`
    The command-line interface for Gadget

    {bold USAGE}
      ggt [COMMAND]

    {bold COMMANDS}
      sync           Sync your Gadget application's source code
      deploy         Deploy your app to production
      list           List your apps
      login          Log in to your account
      logout         Log out of your account
      whoami         Print the currently logged in account
      version        Print the version of ggt

    {bold FLAGS}
      -h, --help     Print command's usage
      -v, --verbose  Print verbose output
          --json     Print output as JSON

    For more information on a specific command, use 'ggt [COMMAND] --help'
`;

export const rootArgs = {
  "--help": {
    type: Boolean,
    alias: "-h",
  },
  "--verbose": {
    type: arg.COUNT,
    alias: ["-v", "--debug"],
  },
  "--json": {
    type: Boolean,
  },
} satisfies ArgsSpec;

export const command = async (): Promise<void> => {
  const ctx = new Context(rootArgs, { argv: process.argv.slice(2), permissive: true });

  await warnIfUpdateAvailable();

  if (ctx.args["--json"]) {
    process.env["GGT_LOG_FORMAT"] = "json";
  }

  if (ctx.args["--verbose"]) {
    process.env["GGT_LOG_LEVEL"] = verbosityToLevel(ctx.args["--verbose"]).toString();
  }

  const cmd = ctx.args._.shift();
  if (isNil(cmd)) {
    log.println(rootUsage());
    process.exit(0);
  }

  if (!isAvailableCommand(cmd)) {
    const [closest] = sortBySimilar(cmd, AvailableCommands);
    log.println`
      Unknown command {yellow ${cmd}}

      Did you mean {blueBright ${closest}}?

      Run {gray ggt --help} for usage
    `;
    process.exit(1);
  }

  const { usage, command, args } = await importCommand(cmd);

  if (ctx.args["--help"]) {
    log.println(usage());
    process.exit(0);
  }

  try {
    await command(ctx.extend({ args, logName: cmd }));
  } catch (error) {
    await reportErrorAndExit(error);
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      log.trace("received signal", { signal });
      log.println` Stopping... {gray Press Ctrl+C again to force}`;
      ctx.abort();

      // when ggt is run via npx, and the user presses ctrl+c, npx
      // sends sigint twice in quick succession. in order to prevent
      // the second sigint from triggering the force exit listener,
      // we wait a bit before registering it
      setTimeout(() => {
        process.once(signal, () => {
          log.println(" Exiting immediately");
          process.exit(1);
        });
      }, ms("100ms")).unref();
    });
  }
};
