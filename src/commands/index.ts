import type { RootArgs } from "./root.js";

export interface Command {
  usage: string;
  init?: Init;
  run: Run;
}

export type Init = (rootArgs: RootArgs) => void | Promise<void>;

export type Run = (rootArgs: RootArgs) => void | Promise<void>;

export const availableCommands = ["sync", "push", "pull", "list", "login", "logout", "whoami"] as const;
