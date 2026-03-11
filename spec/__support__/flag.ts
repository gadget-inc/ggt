import { expect } from "vitest";

import * as root from "../../src/commands/root.js";
import { Commands, type Command } from "../../src/services/command/command.js";
import { parseFlags, type FlagsDefinition, type FlagsResult } from "../../src/services/command/flag.js";

export const makeRootFlags = (...argv: string[]): root.RootFlagsResult => {
  return parseFlags(root.flags, { argv, permissive: true });
};

export const makeFlags = <Args extends FlagsDefinition>(flagsDef: Args, ...argv: string[]): FlagsResult<Args> => {
  const rootFlags = makeRootFlags(...argv);

  // replicate the root command's behavior of shifting the command name
  const commandName = rootFlags._.shift() as Command | undefined;
  if (commandName) {
    // ensure the command was valid
    expect(Commands).toContain(commandName);
  }

  return parseFlags(flagsDef, { argv: rootFlags._ });
};
