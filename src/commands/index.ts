import type { Context } from "../services/context.js";

export interface Command {
  usage: string;
  init?: (ctx: Context) => void | Promise<void>;
  run: (ctx: Context) => void | Promise<void>;
}

export const availableCommands = ["sync", "list", "login", "logout", "whoami"] as const;
