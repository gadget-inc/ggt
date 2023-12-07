import arg from "arg";
import assert from "node:assert";
import type { Context } from "src/services/command/context.js";
import { relativeToThisFile } from "src/services/config/paths.js";
import type { Promisable } from "type-fest";

export type Usage = () => string;

export type Command = (ctx: Context) => Promisable<void>;

export type CommandModule = {
  usage: Usage;
  command: Command;
};

export const AvailableCommands = ["sync", "list", "login", "logout", "whoami", "version", "deploy"] as const;

type AvailableCommand = (typeof AvailableCommands)[number];

export const isAvailableCommand = (value: unknown): value is AvailableCommand => {
  return AvailableCommands.includes(value as AvailableCommand);
};

export const importCommandModule = async (command: AvailableCommand): Promise<CommandModule> => {
  assert(isAvailableCommand(command), `invalid command: ${command}`);
  return (await import(relativeToThisFile(`../../commands/${command}.js`))) as CommandModule;
};

export const rootArgsSpec = {
  "--help": Boolean,
  "-h": "--help",
  "--verbose": arg.COUNT,
  "-v": "--verbose",
  "--json": Boolean,

  // deprecated
  "--debug": "--verbose",
};

export type RootArgs = arg.Result<typeof rootArgsSpec>;
