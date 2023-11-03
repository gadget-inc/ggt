import arg from "arg";
import debug from "debug";
import { parseBoolean } from "../services/args.js";
import { config } from "../services/config.js";
import { CLIError } from "../services/errors.js";
import { isNil } from "../services/is.js";
import { println, sortBySimilarity, sprint } from "../services/print.js";
import { warnIfUpdateAvailable } from "../services/version.js";
import { availableCommands, type CommandModule } from "./index.js";

export const usage = sprint`
    The command-line interface for Gadget

    {bold VERSION}
      ${config.versionFull}

    {bold USAGE}
      $ ggt [COMMAND]

    {bold FLAGS}
      -h, --help     {gray Print command's usage}
      -v, --version  {gray Print version}
          --debug    {gray Print debug output}

    {bold COMMANDS}
      sync    Sync your Gadget application's source code to and
              from your local filesystem.
      list    List your apps.
      login   Log in to your account.
      logout  Log out of your account.
      whoami  Print the currently logged in account.
`;

export const rootArgsSpec = {
  "--help": Boolean,
  "-h": "--help",
  "--version": Boolean,
  "-v": "--version",
  "--debug": Boolean,
};

export type RootArgs = arg.Result<typeof rootArgsSpec>;

export const command = async (): Promise<void> => {
  await warnIfUpdateAvailable();

  const rootArgs = arg(rootArgsSpec, {
    argv: process.argv.slice(2),
    permissive: true,
    stopAtPositional: false,
  });

  if (rootArgs["--debug"] ?? parseBoolean(process.env["DEBUG"])) {
    debug.enable("ggt:*");
    config.debug = true;
  }

  if (rootArgs["--version"]) {
    println(config.version);
    process.exit(0);
  }

  const command = rootArgs._.shift() as (typeof availableCommands)[number] | undefined;
  if (isNil(command)) {
    println(usage);
    process.exit(0);
  }

  if (!availableCommands.includes(command)) {
    const [closest] = sortBySimilarity(command, availableCommands);
    println`
      Unknown command {yellow ${command}}

      Did you mean {blueBright ${closest}}?

      Run {gray ggt --help} for usage
    `;
    process.exit(1);
  }

  const mod = (await import(`./${command}.js`)) as CommandModule;

  if (rootArgs["--help"]) {
    println(mod.usage);
    process.exit(0);
  }

  try {
    await mod.init?.(rootArgs);
    await mod.command(rootArgs);
  } catch (cause) {
    const error = CLIError.from(cause);
    println(error.render());
    await error.capture();
    process.exit(1);
  }
};
