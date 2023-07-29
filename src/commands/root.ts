import _ from "lodash";
import { config } from "../services/config.js";
import { Context, globalArgs } from "../services/context.js";
import { CLIError } from "../services/errors.js";
import { didYouMean, println, sprint } from "../services/output.js";
import { availableCommands, type Command } from "./index.js";

export const usage = sprint`
    The command-line interface for Gadget

    {bold VERSION}
      ${config.versionFull}

    {bold USAGE}
      $ ggt [COMMAND]

    {bold FLAGS}
      -h, --help     {gray Print command's usage}
      -v, --version  {gray Print version}
      -d, --debug    {gray Print debug output}

    {bold COMMANDS}
      sync    Sync your Gadget application's source code to and
              from your local filesystem.
      list    List your apps.
      login   Log in to your account.
      logout  Log out of your account.
      whoami  Print the currently logged in account.
`;

export const run = async (ctx = new Context()) => {
  if (globalArgs["--version"]) {
    println(config.version);
    process.exit(0);
  }

  const command = globalArgs._.shift();
  if (_.isNil(command)) {
    println(usage);
    process.exit(0);
  }

  if (!_.includes(availableCommands, command)) {
    const [closest] = didYouMean(command, availableCommands);
    println`
      Unknown command {yellow ${command}}

      Did you mean {blueBright ${closest}}?

      Run {gray ggt --help} for usage
    `;
    process.exit(1);
  }

  const cmd: Command = await import(`./${command}.js`);

  if (globalArgs["--help"]) {
    println(cmd.usage);
    process.exit(0);
  }

  try {
    await cmd.init?.(ctx);
    await cmd.run(ctx);
  } catch (cause) {
    const error = CLIError.from(cause);
    println(error.render());
    await error.capture(ctx);
    process.exit(1);
  }
};
