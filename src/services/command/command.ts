import assert from "node:assert";
import type { EmptyObject, Promisable } from "type-fest";
import type { RootArgs } from "../../commands/root.js";
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
export type Command = (typeof Commands)[number];

/**
 * Checks if a string is a valid command.
 *
 * @param command - The string to check
 * @returns Whether the string is a valid command
 */
export const isCommand = (command: string): command is Command => {
  return Commands.includes(command as Command);
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
   * The command's {@link Run command}.
   */
  run: Run<Args, ParentArgs>;
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
export type Run<Args extends ArgsDefinition = EmptyObject, ParentArgs extends ArgsDefinition = RootArgs> = (
  ctx: Context<Args, ParentArgs>,
) => Promisable<void>;

/**
 * Imports a command module.
 *
 * @param cmd - The command to import
 * @see {@linkcode CommandModule}
 */
export const importCommand = async (cmd: Command): Promise<CommandModule> => {
  assert(isCommand(cmd), `invalid command: ${cmd}`);

  let module;
  switch (cmd) {
    case "dev":
      module = await import("../../commands/dev.js");
      break;
    case "deploy":
      module = await import("../../commands/deploy.js");
      break;
    case "status":
      module = await import("../../commands/status.js");
      break;
    case "push":
      module = await import("../../commands/push.js");
      break;
    case "pull":
      module = await import("../../commands/pull.js");
      break;
    case "add":
      module = await import("../../commands/add.js");
      break;
    case "open":
      module = await import("../../commands/open.js");
      break;
    case "list":
      module = await import("../../commands/list.js");
      break;
    case "login":
      module = await import("../../commands/login.js");
      break;
    case "logout":
      module = await import("../../commands/logout.js");
      break;
    case "whoami":
      module = await import("../../commands/whoami.js");
      break;
    case "version":
      module = await import("../../commands/version.js");
      break;
  }

  return module as CommandModule;
};

const kCommand = Symbol.for("command");

export const maybeGetCurrentCommand = (ctx: Context): Command | undefined => {
  return ctx.get(kCommand) as Command | undefined;
};

export const setCurrentCommand = (ctx: Context, command: Command): void => {
  ctx.set(kCommand, command);
};
