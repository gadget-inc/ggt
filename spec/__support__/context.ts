import { expect } from "vitest";
import { args } from "../../src/commands/root.js";
import type { ArgsDefinition } from "../../src/services/command/arg.js";
import { Commands } from "../../src/services/command/command.js";
import { Context } from "../../src/services/command/context.js";

export const makeContext = <Args extends ArgsDefinition>({
  parse = {} as Args,
  argv,
}: { parse?: Args; argv?: string[] } = {}): Context<Args> => {
  if (argv) {
    process.argv = ["node", "/some/path/to/ggt", ...argv];
  }

  const ctx = makeRootContext();

  // replicate the root command's behavior of shifting the command name
  const cmd = ctx.args._.shift();
  if (cmd) {
    // ensure the command was valid
    expect(Commands).toContain(cmd);
  }

  return ctx.child({ name: cmd, parse });
};

export const makeRootContext = (): Context => {
  return Context.init({
    name: "root",
    parse: args,
    argv: process.argv.slice(2),
    permissive: true,
  });
};
