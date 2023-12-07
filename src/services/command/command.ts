import arg from "arg";
import assert from "node:assert";
import { pathToFileURL } from "node:url";
import type { Promisable } from "type-fest";
import { config } from "../config/config.js";
import { relativeToThisFile } from "../config/paths.js";
import type { Context } from "./context.js";

export type Usage = () => string;

export type Command = (ctx: Context) => Promisable<void>;

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
  let commandPath = relativeToThisFile(`../../commands/${command}.js`);
  if (config.windows) {
    // https://github.com/nodejs/node/issues/31710
    commandPath = pathToFileURL(commandPath).toString();
  }
  return (await import(commandPath)) as CommandModule;
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
