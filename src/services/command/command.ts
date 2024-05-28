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
 *
 * 1. Every command corresponds to a file inside of src/commands/
 * 2. The order determines the order of commands in the README
 */
export const Commands = ["dev", "deploy", "status", "push", "pull", "add", "open", "list", "login", "logout", "whoami", "version"] as const;

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
 * A command module is a file in the src/commands/ directory.
 */
export type CommandModule<Args extends ArgsDefinition = EmptyObject, ParentArgs extends ArgsDefinition = RootArgs> = {
  /**
   * The command's {@link ArgsDefinition args}.
   */
  args?: Args;

  /**
   * The command's {@link Usage usage}.
   */
  usage: Usage;

  /**
   * The command's {@link Command command}.
   *
   * TODO: rename this to `run`.
   */
  command: Command<Args, ParentArgs>;
};

/**
 * A {@linkcode Command command}'s usage is a function that returns a
 * string describing how to use the command. The function receives its
 * parent command's context.
 */
export type Usage = (ctx: Context) => string;

/**
 * The function that is run when the command is called.
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
