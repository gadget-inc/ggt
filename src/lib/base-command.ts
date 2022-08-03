import { Command, Flags } from "@oclif/core";
import { prompt } from "inquirer";
import type { Level } from "pino";
// eslint-disable-next-line workspaces/require-dependency
import { Api } from "./api";
import { configure } from "./logger";

// eslint-disable-next-line jsdoc/require-jsdoc
export abstract class BaseCommand extends Command {
  static override globalFlags = {
    "log-level": Flags.string({
      summary: "The log level.",
      helpGroup: "global",
      helpValue: "level",
      options: ["trace", "debug", "info", "warn", "error"] as Level[],
      env: "GGT_LOG_LEVEL",
      default: "info",
    }),
  };

  static override flags = {};

  readonly requireUser: boolean = false;

  override async init(): Promise<void> {
    await super.init();
    const { flags } = await this.parse();
    configure({ stdout: flags["log-level"] as Level });

    if (!this.requireUser) {
      return;
    }

    const user = await Api.getCurrentUser();
    if (user) {
      return;
    }

    const { login } = await prompt({
      type: "confirm",
      name: "login",
      message: "You must be logged in to use this command. Would you like to log in?",
    });

    if (login) {
      await Api.login();
    } else {
      this.exit(0);
    }
  }
}
