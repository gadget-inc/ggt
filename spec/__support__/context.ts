import { beforeEach, expect } from "vitest";
import { args } from "../../src/commands/root.js";
import type { ArgsDefinition } from "../../src/services/command/arg.js";
import { Commands, setCurrentCommand, type Command } from "../../src/services/command/command.js";
import { Context } from "../../src/services/command/context.js";

/**
 * The current test's context.
 *
 * All contexts made by {@linkcode makeRootContext} and
 * {@linkcode makeContext} are children of this context.
 */
export let testCtx: Context;

/**
 * Sets up the test context before each test.
 */
export const mockContext = (): void => {
  beforeEach(() => {
    testCtx = Context.init({ name: "test" });
    return () => {
      testCtx.abort();
    };
  });
};

/**
 * Makes a root context the same way the root command does.
 */
export const makeRootContext = (): Context => {
  return testCtx.child({
    name: "root",
    parse: args,
    argv: process.argv.slice(2),
    permissive: true,
  });
};

/**
 * Makes a context the same way the root command would before passing it
 * to a subcommand.
 */
// TODO: make this take an AvailableCommand and use it to type which `parse` must be passed
export const makeContext = <Args extends ArgsDefinition>({
  parse = {} as Args,
  argv,
}: { parse?: Args; argv?: string[] } = {}): Context<Args> => {
  if (argv) {
    process.argv = ["node", "/some/path/to/ggt.js", ...argv];
  }

  const ctx = makeRootContext();

  // replicate the root command's behavior of shifting the command name
  const commandName = ctx.args._.shift() as Command | undefined;
  if (commandName) {
    // ensure the command was valid
    expect(Commands).toContain(commandName);
    setCurrentCommand(ctx, commandName);
  }

  return ctx.child({ name: commandName, parse });
};
