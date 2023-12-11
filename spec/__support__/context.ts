import { expect } from "vitest";
import { rootArgs } from "../../src/commands/root.js";
import type { ArgsSpec } from "../../src/services/command/arg.js";
import { AvailableCommands } from "../../src/services/command/command.js";
import { Context } from "../../src/services/command/context.js";

export const makeContext = <Args extends ArgsSpec>(args?: Args): Context<Args> => {
  const ctx = new Context(rootArgs, { argv: process.argv.slice(2), permissive: true });

  // replicate the root command's behavior of shifting the command name
  // from the args
  const cmd = ctx.args._.shift();
  if (cmd) {
    expect(AvailableCommands).toContain(cmd);
  }

  return ctx.extend({ args, logName: cmd });
};
