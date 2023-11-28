import assert from "node:assert";
import type { Promisable } from "type-fest";
import type { RootArgs } from "./root.js";

export type Usage = () => string;

export type Command = (rootArgs: RootArgs) => Promisable<void> | Promisable<(cause?: unknown) => Promisable<void>>;

export type CommandModule = {
  usage: Usage;
  command: Command;
};

export const AvailableCommands = ["sync", "list", "login", "logout", "whoami", "version"] as const;

type AvailableCommand = (typeof AvailableCommands)[number];

export const isAvailableCommand = (value: unknown): value is AvailableCommand => {
  return AvailableCommands.includes(value as AvailableCommand);
};

export const importCommandModule = async (command: AvailableCommand): Promise<CommandModule> => {
  assert(isAvailableCommand(command), `invalid command: ${command}`);
  return (await import(`./${command}.js`)) as CommandModule;
};
