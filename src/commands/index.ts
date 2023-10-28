import type { RootArgs } from "./root.js";

export interface Command {
  usage: string;
  init?: (rootArgs: RootArgs) => void | Promise<void>;
  run: (rootArgs: RootArgs) => void | Promise<void>;
}

export const availableCommands = ["sync", "push", "pull", "list", "login", "logout", "whoami"] as const;
