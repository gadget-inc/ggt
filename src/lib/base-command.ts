import type { Config } from "@oclif/core";
import { Command, Flags, settings } from "@oclif/core";
import { ExitError } from "@oclif/core/lib/errors";
import { CLIError } from "@oclif/errors";
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
import { api, GADGET_ENDPOINT } from "./api";
import { Client } from "./client";
import { setConfig } from "./config";
import { BaseError, UnexpectedError as UnknownError } from "./errors";
import { session } from "./session";

export abstract class BaseCommand extends Command {
  /**
   * Determines how high the command is listed in the README. The lower the number, the higher the command is listed. Equal numbers are
   * sorted alphabetically.
   */
  static priority = Infinity;

  static override globalFlags = {
    app: Flags.string({
      char: "A",
      summary: "The Gadget application this command applies to.",
      helpGroup: "global",
      helpValue: "name",
      parse: (value) => {
        const app = /^(https:\/\/)?(?<app>[\w-]+)(\..*)?/.exec(value)?.groups?.["app"];
        if (!app) throw new CLIError("Flag '-A, --app=<name>' is invalid");
        return Promise.resolve(app);
      },
    }),
    debug: Flags.boolean({
      char: "D",
      summary: "Whether to output debug information.",
      helpGroup: "global",
      default: false,
    }),
  };

  /**
   * The selected application.
   *
   * Will be `undefined` if the user is not logged in or if the user has not selected an app.
   *
   * @see {@linkcode requireApp requireApp}
   */
  app!: string;

  /**
   * Determines whether the command requires the user to be logged in or not.
   * If true and the user is not logged in, the user will be prompted to login before the command is run.
   */
  readonly requireUser: boolean = false;

  /**
   * Determines whether the command requires a Gadget app to be selected or not.
   * If true and an app hasn't been selected, the user will be prompted to select an app before the command is run.
   *
   * Implies {@linkcode requireUser requireUser = true}.
   */
  readonly requireApp: boolean = false;

  /**
   * The GraphQL client to use for all Gadget API requests.
   *
   * Will be `undefined` if the user is not logged in or if the user has not selected an app.
   *
   * @see {@linkcode requireApp requireApp}
   */
  client!: Client;

  constructor(argv: string[], config: Config) {
    super(argv, config);
  }

  /**
   * Indicates whether the command is being run with the `-D/--debug` flag.
   */
  get debugEnabled(): boolean {
    return !!settings.debug;
  }

  override async init(): Promise<void> {
    await super.init();
    const { flags, argv } = await this.parse({ flags: BaseCommand.globalFlags, strict: false });

    // remove global flags from argv so that when the implementation calls parse, it doesn't get confused by them
    this.argv = argv;

    if (flags.debug) {
      settings.debug = true;
      Debug.enable(`${this.config.bin}:*`);
    }

    setConfig(this.config);

    if (!this.requireUser && !this.requireApp) {
      return;
    }

    if (!(await api.getCurrentUser())) {
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

    if (!this.requireApp) {
      return;
    }

    let app = flags.app;
    if (!app) {
      ({ app } = await prompt<{ app: string }>({
        type: "list",
        name: "app",
        message: "Please select the app to use with this command.",
        choices: await api.getApps().then((apps) => apps.map((app) => app.slug)),
      }));
    }

    this.app = app;

    this.client = new Client(app, {
      ws: {
        headers: {
          "user-agent": this.config.userAgent,
          cookie: `session=${encodeURIComponent(session.get() as string)};`,
        },
      },
    });
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

            session.set(value);

            const user = await api.getCurrentUser();
            if (!user) throw new Error("missing current user");

            if (user.name) {
              this.log(`Hello, ${user.name} (${user.email})`);
            } else {
              this.log(`Hello, ${user.email}`);
            }

            redirectTo.searchParams.set("success", "true");
            resolve();
          } catch (error) {
            session.set(undefined);
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

      this.log("Your browser has been opened. Please log in to your account.");

      await receiveSession;
    } finally {
      server?.close();
    }
  }

  /**
   * Overrides the default `catch` behavior so we can control how errors are printed to the user. This is called automatically by oclif when
   * an error is thrown during the `init` or `run` methods.
   */
  override catch(cause: Error & { exitCode?: number }): never {
    const error = cause instanceof BaseError ? cause : new UnknownError(cause);
    console.error(error.render(this.config));

    // The original implementation of `catch` re-throws the error so that it's caught and printed by oclif's `handle` method. We still want
    // to end up in oclif's `handle` method, but we don't want it to print the error again so we throw an ExitError instead. This will cause
    // `handle` to not print the error, but still exit with the correct exit code.
    //
    //  catch: https://github.com/oclif/core/blob/12e31ff2288606e583e03bf774a3244f3136cd10/src/command.ts#L261
    // handle: https://github.com/oclif/core/blob/12e31ff2288606e583e03bf774a3244f3136cd10/src/errors/handle.ts#L15
    throw new ExitError(process.exitCode ?? cause.exitCode ?? 1);
  }
}
