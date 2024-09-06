import { expect } from "vitest";
import * as root from "../../src/commands/root.js";
import { parseArgs, type ArgsDefinition, type ArgsDefinitionResult } from "../../src/services/command/arg.js";
import { Commands, setCurrentCommand, type Command } from "../../src/services/command/command.js";
import { testCtx } from "./context.js";

export const makeRootArgs = (...argv: string[]): root.RootArgsResult => {
  return parseArgs(root.args, { argv, permissive: true });
};

export const makeArgs = <Args extends ArgsDefinition>(args: Args, ...argv: string[]): ArgsDefinitionResult<Args> => {
  const rootArgs = makeRootArgs(...argv);

  // replicate the root command's behavior of shifting the command name
  const commandName = rootArgs._.shift() as Command | undefined;
  if (commandName) {
    // ensure the command was valid
    expect(Commands).toContain(commandName);
    setCurrentCommand(testCtx, commandName);
  }

  return parseArgs(args, { argv: rootArgs._ });
};
