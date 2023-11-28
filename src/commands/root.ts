import arg from "arg";
import ms from "ms";
import { verbosityToLevel } from "../services/output/log/level.js";
import { createLogger } from "../services/output/log/logger.js";
import { sprint } from "../services/output/sprint.js";
import { warnIfUpdateAvailable } from "../services/output/update.js";
import { sortBySimilar } from "../services/util/collection.js";
import { isNil } from "../services/util/is.js";
import { AvailableCommands, importCommandModule, isAvailableCommand, type Usage } from "./command.js";

const log = createLogger({ name: "root" });

export const usage: Usage = () => sprint`
    The command-line interface for Gadget

    {bold USAGE}
      ggt [COMMAND]

    {bold COMMANDS}
      sync           Sync your Gadget application's source code
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

export const rootArgsSpec = {
  "--help": Boolean,
  "-h": "--help",
  "--verbose": arg.COUNT,
  "-v": "--verbose",
  "--json": Boolean,

  // deprecated
  "--debug": "--verbose",
};

export type RootArgs = arg.Result<typeof rootArgsSpec>;

export const command = async (): Promise<void> => {
  await warnIfUpdateAvailable();

  const rootArgs = arg(rootArgsSpec, {
    argv: process.argv.slice(2),
    permissive: true,
    stopAtPositional: false,
  });

  if (rootArgs["--json"]) {
    process.env["GGT_LOG_FORMAT"] = "json";
  }

  if (rootArgs["--verbose"]) {
    process.env["GGT_LOG_LEVEL"] = verbosityToLevel(rootArgs["--verbose"]).toString();
  }

  const command = rootArgs._.shift();
  if (isNil(command)) {
    log.println(usage());
    process.exit(0);
  }

  if (!isAvailableCommand(command)) {
    const [closest] = sortBySimilar(command, AvailableCommands);
    log.println`
      Unknown command {yellow ${command}}

      Did you mean {blueBright ${closest}}?

      Run {gray ggt --help} for usage
    `;
    process.exit(1);
  }

  const commandModule = await importCommandModule(command);

  if (rootArgs["--help"]) {
    log.println(commandModule.usage());
    process.exit(0);
  }

  const stop = await commandModule.command(rootArgs);
  if (!stop) {
    return;
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      log.println` Stopping... {gray Press Ctrl+C again to force}`;
      void stop();

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
