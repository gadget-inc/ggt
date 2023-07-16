import _ from "lodash";
import { context, globalArgs } from "../services/context.js";
import { CLIError } from "../services/errors.js";
import { didYouMean, println, sprint } from "../services/output.js";
import { availableCommands, type Command } from "./index.js";

export const usage = sprint`
    The command-line interface for Gadget

    {bold VERSION}
      ${context.config.versionFull}

    {bold USAGE}
      $ ggt [COMMAND]

    {bold COMMANDS}
      sync    Sync your Gadget application's source code to and from your local filesystem.
      list    List the apps available to the currently logged in user.
      login   Log in to your account.
      logout  Log out of your account.
      whoami  Show the name and email address of the currently logged in user.
`;

export const run = async () => {
  const command = globalArgs._.shift();

  if (_.isNil(command)) {
    println(usage);
    process.exit(0);
  }

  if (!_.includes(availableCommands, command)) {
    const [closest] = didYouMean(command, availableCommands);
    println`{yellow ${command}} is not a ggt command, did you mean {blueBright ${closest}}?`;
    println();
    println(usage);
    process.exit(1);
  }

  const cmd: Command = await import(`./commands/${command}.js`);

  if (globalArgs["--help"]) {
    println(cmd.usage);
    process.exit(0);
  }

  try {
    await cmd.init?.();
    await cmd.run();
  } catch (cause) {
    const error = CLIError.from(cause);
    println(error.render());
    await error.capture();
    process.exit(1);
  }
};
