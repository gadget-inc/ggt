import { expect } from "vitest";

import * as root from "../../src/commands/root.js";
import { parseArgs, type ArgsDefinition, type ArgsDefinitionResult, type ParseArgsOptions } from "../../src/services/command/arg.js";
import { Commands, type Command } from "../../src/services/command/command.js";

export const makeRootArgs = (...argv: string[]): root.RootArgsResult => {
  return parseArgs(root.args, { argv, permissive: true });
};

export const makeArgs = <Args extends ArgsDefinition>(args: Args, ...argv: string[]): ArgsDefinitionResult<Args> => {
  return makeArgsWithOptions(args, undefined, ...argv);
};

export const makeArgsWithOptions = <Args extends ArgsDefinition>(
  args: Args,
  parseOptions: ParseArgsOptions | undefined,
  ...argv: string[]
): ArgsDefinitionResult<Args> => {
  const rootArgs = makeRootArgs(...argv);

  // replicate the root command's behavior of shifting the command name
  const commandName = rootArgs._.shift() as Command | undefined;
  if (commandName) {
    // ensure the command was valid
    expect(Commands).toContain(commandName);
  }

  // replicate root.ts's behavior: for permissive commands with subcommands,
  // pass -h through to the command's run function for subcommand-level help
  if ((rootArgs["-h"] ?? rootArgs["--help"]) && parseOptions?.permissive && rootArgs._.length > 0) {
    rootArgs._.push("-h");
  }

  return parseArgs(args, { ...parseOptions, argv: rootArgs._ });
};
