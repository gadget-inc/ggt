/* eslint-disable @typescript-eslint/consistent-type-imports */
import assert from "node:assert";
import { pathToFileURL } from "node:url";
import type { Promisable } from "type-fest";
import type { rootArgs } from "../../commands/root.js";
import { config } from "../config/config.js";
import { relativeToThisFile } from "../util/paths.js";
import type { ArgsSpec } from "./arg.js";
import type { Context } from "./context.js";

export const AvailableCommands = ["sync", "list", "login", "logout", "whoami", "version", "deploy"] as const;

export type AvailableCommand = (typeof AvailableCommands)[number];

export const isAvailableCommand = (command: string): command is AvailableCommand => {
  return AvailableCommands.includes(command as AvailableCommand);
};

export const importCommand = async (cmd: AvailableCommand): Promise<CommandSpec> => {
  assert(isAvailableCommand(cmd), `invalid command: ${cmd}`);
  let commandPath = relativeToThisFile(`../../commands/${cmd}.js`);
  if (config.windows) {
    // https://github.com/nodejs/node/issues/31710
    commandPath = pathToFileURL(commandPath).toString();
  }
  return (await import(commandPath)) as CommandSpec;
};

export type CommandSpec<Args extends ArgsSpec = ArgsSpec, ParentArgsSpec extends ArgsSpec = typeof rootArgs> = {
  args?: Args;
  usage: () => string;
  command: (ctx: Context<Args, ParentArgsSpec>) => Promisable<void>;
};

export type Command<Spec extends ArgsSpec = ArgsSpec, ParentSpec extends ArgsSpec = typeof rootArgs> = CommandSpec<
  Spec,
  ParentSpec
>["command"];

export type Usage = CommandSpec["usage"];
