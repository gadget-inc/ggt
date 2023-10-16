import type { GlobalArgs } from "../services/args.js";

export interface Command {
  usage: string;
  init?: (globalArgs: GlobalArgs) => void | Promise<void>;
  run: (globalArgs: GlobalArgs) => void | Promise<void>;
}

export const availableCommands = ["sync", "list", "login", "logout", "whoami"] as const;
