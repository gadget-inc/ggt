import { Command, Flags } from "@oclif/core";
import type { FlagInput, OptionFlag } from "@oclif/core/lib/interfaces";
import { prompt } from "inquirer";
import type { Level } from "pino";
import { Api } from "./api";
import { logger } from "./logger";

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
    const { flags } = await this.parse<ParsedFlags<typeof BaseCommand>, any>();
    logger.configure({ stdout: flags["log-level"] as Level });

    if (!this.requireUser) {
      return;
    }

    const user = await Api.getCurrentUser();
    if (user) {
      return;
    }

    const { login } = await prompt<{ login: string }>({
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

/**
 * Type helper that turns a command's flags into its parsed representation.
 *
 * @example
 * class MyCommand extends Command {
 *   static globalFlags = {
 *     foo: Flags.string({ ... }),
 *   };
 *
 *   static flags = {
 *     bar: Flags.number({ ... }),
 *     baz: Flags.boolean({ ... }),
 *   };
 * }
 *
 * ParsedFlags<typeof MyCommand>
 * // { foo: string, bar: number, baz: boolean }
 */
export type ParsedFlags<TCommand extends Command["ctor"], TFlags extends FlagInput<any> = TCommand["flags"] & TCommand["globalFlags"]> = {
  [K in keyof TFlags]: TFlags[K] extends OptionFlag<infer FlagType> ? FlagType : never;
};
