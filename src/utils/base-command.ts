import type { Config, Interfaces } from "@oclif/core";
import { Command, Flags, settings } from "@oclif/core";
import { CLIError as CLIError2 } from "@oclif/core/lib/errors/index.js";
import { CLIError, ExitError } from "@oclif/errors";
import * as Sentry from "@sentry/node";
import chalkTemplate from "chalk-template";
import Debug from "debug";
import getPort from "get-port";
import inquirer from "inquirer";
import type { Notification } from "node-notifier";
import notifier from "node-notifier";
import type WindowsBalloon from "node-notifier/notifiers/balloon.js";
import type Growl from "node-notifier/notifiers/growl.js";
import type NotificationCenter from "node-notifier/notifiers/notificationcenter.js";
import type NotifySend from "node-notifier/notifiers/notifysend.js";
import type WindowsToaster from "node-notifier/notifiers/toaster.js";
import type { Server } from "node:http";
import http from "node:http";
import path from "node:path";
import open from "open";
import { dedent } from "ts-dedent";
import { context } from "./context.js";
import { BaseError, UnexpectedError } from "./errors.js";

export type Flags<T extends typeof Command> = Interfaces.InferredFlags<(typeof BaseCommand)["baseFlags"] & T["flags"]>;
export type Args<T extends typeof Command> = Interfaces.InferredArgs<T["args"]>;

/**
 * BaseCommand is the base class for all commands in the Gadget CLI.
 */
export abstract class BaseCommand<T extends typeof Command> extends Command {
  /**
   * Determines how high the command is listed in the README. The lower the number, the higher the command is listed.
   * Equal numbers are sorted alphabetically.
   */
  static priority = Infinity;

  /**
   * Flags that are available to all commands.
   *
   * Short form should be capitalized.
   */
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
   *
   * If true and the user is not logged in, the user will be prompted to login before the underlying command is
   * initialized and run.
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
    context.config = this.config;

    if (context.env.productionLike) {
      Sentry.init({
        dsn: "https://0c26e0d8afd94e77a88ee1c3aa9e7065@o250689.ingest.sentry.io/6703266",
        release: context.config.version,
      });
    }

    await super.init();

    if (this.requireUser && !(await context.getUser())) {
      // we purposely log the user in before parsing flags in case one of the flags requires the user to be logged in
      // e.g. the `--app` flag verifies that the user has access to the app they are trying to use
      const { login } = await inquirer.prompt<{ login: boolean }>({
        type: "confirm",
        name: "login",
        message: "You must be logged in to use this command. Would you like to log in?",
      });

      if (!login) {
        return this.exit(0);
      }

      await this.login();
    }

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
    notifier.notify(
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
        server = http.createServer(async (req, res) => {
          const redirectTo = new URL(`https://${context.domains.services}/auth/cli`);

          try {
            if (!req.url) throw new Error("missing url");
            const incomingUrl = new URL(req.url, `http://localhost:${port}`);

            const value = incomingUrl.searchParams.get("session");
            if (!value) throw new Error("missing session");

            context.session = value;

            const user = await context.getUser();
            if (!user) throw new Error("missing current user");

            if (user.name) {
              this.log(chalkTemplate`Hello, ${user.name} {gray (${user.email})}`);
            } else {
              this.log(`Hello, ${user.email}`);
            }
            this.log();

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

      const url = new URL(`https://${context.domains.services}/auth/login`);
      url.searchParams.set("returnTo", `https://${context.domains.services}/auth/cli/callback?port=${port}`);
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
   * Overrides the default `catch` behavior so we can control how errors are printed to the user. This is called
   * automatically by oclif when an error is thrown during the `init` or `run` methods.
   */
  override async catch(cause: Error): Promise<never> {
    if (cause instanceof CLIError || cause instanceof CLIError2) {
      // CLIErrors are user errors (invalid flag, arg, etc...) and already print nicely formatted error messages
      throw cause;
    }

    const error = cause instanceof BaseError ? cause : new UnexpectedError(cause);
    console.error(error.render());
    await error.capture();

    // The original implementation of `catch` re-throws the error so that it's caught and printed by oclif's `handle`
    // method. We still want to end up in oclif's `handle` method, but we don't want it to print the error again so we
    // throw an ExitError instead. This will cause `handle` to not print the error, but still exit with the correct exit
    // code.
    //
    //  catch: https://github.com/oclif/core/blob/12e31ff2288606e583e03bf774a3244f3136cd10/src/command.ts#L261
    // handle: https://github.com/oclif/core/blob/12e31ff2288606e583e03bf774a3244f3136cd10/src/errors/handle.ts#L15
    throw new ExitError(1);
  }
}
