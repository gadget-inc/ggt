export interface Command {
  usage: string;
  init?: () => void | Promise<void>;
  run: () => void | Promise<void>;
}

export const availableCommands = ["sync", "list", "login", "logout", "whoami"] as const;
