import type { Config, Interfaces } from "@oclif/core";
import { Command, Flags, settings } from "@oclif/core";
import { ExitError } from "@oclif/core/lib/errors";
import chalk from "chalk";
import Debug from "debug";
import getPort from "get-port";
import type { Server } from "http";
import { createServer } from "http";
import { prompt } from "inquirer";
import type { Notification } from "node-notifier";
import { notify } from "node-notifier";
import type WindowsBalloon from "node-notifier/notifiers/balloon";
import type Growl from "node-notifier/notifiers/growl";
import type NotificationCenter from "node-notifier/notifiers/notificationcenter";
import type NotifySend from "node-notifier/notifiers/notifysend";
import type WindowsToaster from "node-notifier/notifiers/toaster";
import open from "open";
import path from "path";
import dedent from "ts-dedent";
import { context, GADGET_ENDPOINT } from "./context";
import { BaseError, UnexpectedError as UnknownError } from "./errors";

export type Flags<T extends typeof Command> = Interfaces.InferredFlags<(typeof BaseCommand)["baseFlags"] & T["flags"]>;
export type Args<T extends typeof Command> = Interfaces.InferredArgs<T["args"]>;

export abstract class BaseCommand<T extends typeof Command> extends Command {
  /**
   * Determines how high the command is listed in the README. The lower the number, the higher the command is listed. Equal numbers are
   * sorted alphabetically.
   */
  static priority = Infinity;

  static override baseFlags = {
    debug: Flags.boolean({
      char: "D",
      summary: "Whether to output debug information.",
      helpGroup: "global",
      default: false,
    }),
  };

  /**
   * Determines whether the command requires the user to be logged in or not.
   * If true and the user is not logged in, the user will be prompted to login before the command is run.
   */
  readonly requireUser: boolean = false;

  /**
   * The parsed flags for the command.
   */
  flags!: Flags<T>;

  /**
   * The parsed arguments for the command.
   */
  args!: Args<T>;

  constructor(argv: string[], config: Config) {
    super(argv, config);

    // TODO: Remove this once the `@oclif/core` warnIfFlagDeprecated function checks base flags as well.
    // warnIfFlagDeprecated throws a null pointer because it assumes all parsed flags are in the flags object (which is not the case for global flags).
    // https://github.com/oclif/core/blob/11c5752cec838d08bb27cd55f0f1aa2390df3c5e/src/command.ts#L259
    this.ctor.flags = { ...this.ctor.flags, ...BaseCommand.baseFlags };
  }

  /**
   * Indicates whether the command is being run with the `-D/--debug` flag.
   */
  get debugEnabled(): boolean {
    return !!settings.debug;
  }

  override async init(): Promise<void> {
    await super.init();

    context.config = this.config;

    const { flags, args } = await this.parse({
      flags: this.ctor.flags,
      baseFlags: (super.ctor as typeof BaseCommand).baseFlags,
      args: this.ctor.args,
      strict: this.ctor.strict,
    });

    this.flags = flags as Flags<T>;
    this.args = args as Args<T>;

    if (flags.debug) {
      settings.debug = true;
      Debug.enable(`${this.config.bin}:*`);
    }

    if (this.requireUser && !(await context.getUser())) {
      const { login } = await prompt<{ login: boolean }>({
        type: "confirm",
        name: "login",
        message: "You must be logged in to use this command. Would you like to log in?",
      });

      if (!login) {
        return this.exit(0);
      }

      await this.login();
    }
  }

  /**
   * Sends a native OS notification to the user.
   *
   * @see {@link https://www.npmjs.com/package/node-notifier node-notifier}
   */
  notify(
    notification:
      | Notification
      | NotificationCenter.Notification
      | NotifySend.Notification
      | WindowsToaster.Notification
      | WindowsBalloon.Notification
      | Growl.Notification
  ): void {
    notify(
      {
        title: "Gadget",
        contentImage: path.join(this.config.root, "assets", "favicon-128@4x.png"),
        icon: path.join(this.config.root, "assets", "favicon-128@4x.png"),
        sound: true,
        timeout: false,
        ...notification,
      },
      (error) => {
        if (error) this.warn(error);
      }
    );
  }

  /**
   * Opens the Gadget login page in the user's default browser and waits for the user to login.
   */
  async login(): Promise<void> {
    let server: Server | undefined;

    try {
      const port = await getPort();
      const receiveSession = new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        server = createServer(async (req, res) => {
          const redirectTo = new URL(`${GADGET_ENDPOINT}/auth/cli`);

          try {
            if (!req.url) throw new Error("missing url");
            const incomingUrl = new URL(req.url, `http://localhost:${port}`);

            const value = incomingUrl.searchParams.get("session");
            if (!value) throw new Error("missing session");

            context.session = value;

            const user = await context.getUser();
            if (!user) throw new Error("missing current user");

            if (user.name) {
              this.log(chalk`Hello, ${user.name} {gray (${user.email})}`);
            } else {
              this.log(`Hello, ${user.email}`);
            }

            redirectTo.searchParams.set("success", "true");
            resolve();
          } catch (error) {
            context.session = undefined;
            redirectTo.searchParams.set("success", "false");
            reject(error);
          } finally {
            res.writeHead(303, { Location: redirectTo.toString() });
            res.end();
          }
        });

        server.listen(port);
      });

      const url = new URL(`${GADGET_ENDPOINT}/auth/login`);
      url.searchParams.set("returnTo", `${GADGET_ENDPOINT}/auth/cli/callback?port=${port}`);
      await open(url.toString());

      this.log(dedent`
        We've opened Gadget's login page using your default browser.

        Please log in and then return to this terminal.\n
      `);

      await receiveSession;
    } finally {
      server?.close();
    }
  }

  /**
   * Overrides the default `catch` behavior so we can control how errors are printed to the user. This is called automatically by oclif when
   * an error is thrown during the `init` or `run` methods.
   */
  override async catch(cause: Error & { exitCode?: number }): Promise<never> {
    const error = cause instanceof BaseError ? cause : new UnknownError(cause);
    console.error(error.render());
    await error.capture();

    // The original implementation of `catch` re-throws the error so that it's caught and printed by oclif's `handle` method. We still want
    // to end up in oclif's `handle` method, but we don't want it to print the error again so we throw an ExitError instead. This will cause
    // `handle` to not print the error, but still exit with the correct exit code.
    //
    //  catch: https://github.com/oclif/core/blob/12e31ff2288606e583e03bf774a3244f3136cd10/src/command.ts#L261
    // handle: https://github.com/oclif/core/blob/12e31ff2288606e583e03bf774a3244f3136cd10/src/errors/handle.ts#L15
    throw new ExitError(process.exitCode ?? cause.exitCode ?? 1);
  }
}
