import type { Config as OclifConfig } from "@oclif/core";
import { Command, Flags } from "@oclif/core";
import { CLIError } from "@oclif/errors";
import getPort from "get-port";
import type { Got } from "got";
import got, { HTTPError } from "got";
import type { Server } from "http";
import { createServer } from "http";
import { prompt } from "inquirer";
import open from "open";
import type { Level } from "pino";
import { Client } from "./client";
import { Config } from "./config";
import { Env } from "./env";
import { logger } from "./logger";
import type { App, User } from "./types";

export const ENDPOINT = Env.productionLike ? "https://app.gadget.dev" : "https://app.ggt.dev:3000";

export abstract class BaseCommand extends Command {
  static override globalFlags = {
    app: Flags.string({
      char: "A",
      summary: "The Gadget app this command applies to.",
      helpGroup: "global",
      helpValue: "name",
      parse: (value) => {
        const app = /^(https:\/\/)?(?<app>[\w-]+)(\..*)?/.exec(value)?.groups?.["app"];
        if (!app) throw new CLIError("Flag '-A, --app=<name>' is invalid");
        return Promise.resolve(app);
      },
    }),
    "log-level": Flags.string({
      summary: "The log level.",
      helpGroup: "global",
      helpValue: "level",
      options: ["trace", "debug", "info", "warn", "error"] as Level[],
      env: "GGT_LOG_LEVEL",
      default: "info",
    }),
  };

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

  readonly http: Got;

  client!: Client;

  constructor(argv: string[], config: OclifConfig) {
    super(argv, config);

    this.http = got.extend({
      hooks: {
        beforeRequest: [
          (options) => {
            options.headers["user-agent"] = this.config.userAgent;
            if (options.url.origin === ENDPOINT && Config.session) {
              options.headers = { ...options.headers, cookie: `session=${encodeURIComponent(Config.session)};` };
            }
          },
        ],
      },
    });
  }

  override async init(): Promise<void> {
    await super.init();
    const { flags, argv } = await this.parse({ flags: BaseCommand.globalFlags, strict: false });
    logger.configure({ stdout: flags["log-level"] as Level });

    // remove global flags from argv
    this.argv = argv;

    if (!this.requireUser && !this.requireApp) {
      return;
    }

    if (!(await this.getCurrentUser())) {
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
        choices: await this.getApps().then((apps) => apps.map((app) => app.slug)),
      }));
    }

    this.client = new Client(app, {
      ws: {
        headers: {
          "user-agent": this.config.userAgent,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          cookie: `session=${encodeURIComponent(Config.session!)};`,
        },
      },
    });
  }

  async login(): Promise<void> {
    let server: Server | undefined;

    try {
      const port = await getPort();
      const receiveSession = new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        server = createServer(async (req, res) => {
          const redirectTo = new URL(`${ENDPOINT}/auth/cli`);

          try {
            if (!req.url) throw new Error("missing url");
            const incomingUrl = new URL(req.url, `http://localhost:${port}`);

            const session = incomingUrl.searchParams.get("session");
            if (!session) throw new Error("missing session");

            Config.session = session;

            const user = await this.getCurrentUser();
            if (!user) throw new Error("missing current user");

            if (user.name) {
              logger.info(`👋 Hello, ${user.name} (${user.email})`);
            } else {
              logger.info(`👋 Hello, ${user.email}`);
            }

            Config.save();

            redirectTo.searchParams.set("success", "true");
            resolve();
          } catch (error) {
            redirectTo.searchParams.set("success", "false");
            reject(error);
          } finally {
            res.writeHead(303, { Location: redirectTo.toString() });
            res.end();
          }
        });

        server.listen(port);
      });

      const url = new URL(`${ENDPOINT}/auth/login`);
      url.searchParams.set("returnTo", `${ENDPOINT}/auth/cli/callback?port=${port}`);
      await open(url.toString());

      logger.info("Your browser has been opened. Please log in to your account.");

      await receiveSession;
    } finally {
      server?.close();
    }
  }

  /**
   * @returns The current user, or undefined if the user is not logged in.
   */
  async getCurrentUser(): Promise<User | undefined> {
    if (!Config.session) return undefined;

    try {
      return await this.http(`${ENDPOINT}/auth/api/current-user`).json<User>();
    } catch (error) {
      if (error instanceof HTTPError && error.response.statusCode === 401) {
        Config.session = undefined;
        Config.save();
        return undefined;
      }
      throw error;
    }
  }

  /**
   * @returns A list of Gadget apps that the user has access to.
   */
  async getApps(): Promise<App[]> {
    if (!Config.session) return [];

    return await this.http(`${ENDPOINT}/auth/api/apps`).json<App[]>();
  }
}
