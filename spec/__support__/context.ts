import { expect } from "vitest";
import { rootArgs } from "../../src/commands/root.js";
import type { ArgsSpec } from "../../src/services/command/arg.js";
import { AvailableCommands } from "../../src/services/command/command.js";
import { Context } from "../../src/services/command/context.js";

export const makeContext = <Args extends ArgsSpec>({ parse = {} as Args, argv }: { parse?: Args; argv?: string[] } = {}): Context<Args> => {
  if (argv) {
    process.argv = ["node", "/some/path/to/ggt", ...argv];
  }

  const ctx = Context.init({ name: "test", parse: rootArgs, argv: process.argv.slice(2), permissive: true });

  // replicate the root command's behavior of shifting the command name
  const cmd = ctx.args._.shift();
  if (cmd) {
    // ensure the command was valid
    expect(AvailableCommands).toContain(cmd);
  }

  return ctx.child({ name: cmd, parse });
};
