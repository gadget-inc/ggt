import assert from "node:assert";
import { pathToFileURL } from "node:url";
import type { EmptyObject, Promisable } from "type-fest";
import type { RootArgs } from "../../commands/root.js";
import { config } from "../config/config.js";
import { relativeToThisFile } from "../util/paths.js";
import type { ArgsDefinition } from "./arg.js";
import type { Context } from "./context.js";

/**
 * The list of available commands.
 * - Each command is a separate file in src/commands.
 * - The order determines the order of commands in the README.
 */
export const Commands = ["sync", "list", "login", "logout", "whoami", "version"] as const;

// deploy is still in preview
if (process.env["GGT_DEPLOY_PREVIEW"]) {
  (Commands as unknown as string[]).push("deploy");
}

/**
 * One of the commands in {@link Commands}.
 */
export type AvailableCommand = (typeof Commands)[number];

/**
 * Checks if a string is a valid command.
 *
 * @param command - The string to check
 * @returns Whether the string is a valid command
 */
export const isAvailableCommand = (command: string): command is AvailableCommand => {
  return Commands.includes(command as AvailableCommand);
};

/**
 * A command module is a file in the src/commands directory.
 */
export type CommandModule<Args extends ArgsDefinition = EmptyObject, ParentArgs extends ArgsDefinition = RootArgs> = {
  /**
   * The command's {@link ArgsDefinition}.
   */
  args?: Args;

  /**
   * The command's {@link Usage}.
   */
  usage: Usage;

  /**
   * The command's {@link Command}.
   */
  command: Command<Args, ParentArgs>;
};

/**
 * A command's usage is a string that describes how to use the command.
 */
export type Usage = (ctx: Context) => string;

/**
 * The function that is run when the command is invoked.
 *
 * @param ctx - A {@linkcode Context} with the command's {@linkcode Args} and {@linkcode ParentArgs}.
 */
export type Command<Args extends ArgsDefinition = EmptyObject, ParentArgs extends ArgsDefinition = RootArgs> = (
  ctx: Context<Args, ParentArgs>,
) => Promisable<void>;

/**
 * Imports a command module.
 *
 * @param cmd - The command to import
 * @see {@linkcode CommandModule}
 */
export const importCommand = async (cmd: AvailableCommand): Promise<CommandModule> => {
  assert(isAvailableCommand(cmd), `invalid command: ${cmd}`);
  let commandPath = relativeToThisFile(`../../commands/${cmd}.js`);
  if (config.windows) {
    // https://github.com/nodejs/node/issues/31710
    commandPath = pathToFileURL(commandPath).toString();
  }
  return (await import(commandPath)) as CommandModule;
};
