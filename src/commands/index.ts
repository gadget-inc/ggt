import type { RootArgs } from "./root.js";

export type CommandModule = {
  usage: string;
  init?: Init;
  command: Command;
};

export type Init = (rootArgs: RootArgs) => void | Promise<void>;

export type Command = (rootArgs: RootArgs) => void | Promise<void>;

export const availableCommands = ["sync", "push", "pull", "reset", "list", "login", "logout", "whoami"] as const;
