import type { RootArgs } from "./root.js";

export interface CommandModule {
  usage: string;
  init?: Init;
  command: Command;
}

export type Init = (rootArgs: RootArgs) => void | Promise<void>;

export type Command = (rootArgs: RootArgs) => void | Promise<void>;

export const availableCommands = ["sync", "push", "pull", "list", "login", "logout", "whoami"] as const;
