import type { Config as OclifConfig } from "@oclif/core";
import { Command, Flags } from "@oclif/core";
import getPort from "get-port";
import type { Got } from "got";
import got, { HTTPError } from "got";
import type { Server } from "http";
import { createServer } from "http";
import { prompt } from "inquirer";
import open from "open";
import type { Level } from "pino";
import { Config } from "./config";
import { Env } from "./env";
import { logger } from "./logger";
import type { User } from "./types";

export const ENDPOINT = Env.productionLike ? "https://app.gadget.dev" : "https://app.ggt.dev:3000";

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

  /**
   * Indicates the command requires the user to be logged in or not.
   * If true and the user is not logged in, the user will be prompted to login before the command is run.
   */
  readonly requireUser: boolean = false;

  readonly http: Got;

  constructor(argv: string[], config: OclifConfig) {
    super(argv, config);

    this.http = got.extend({
      hooks: {
        beforeRequest: [
          (options) => {
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
    const { flags } = await this.parse({ flags: BaseCommand.globalFlags, strict: false });
    logger.configure({ stdout: flags["log-level"] as Level });

    if (!this.requireUser) {
      return;
    }

    const user = await this.getCurrentUser();
    if (user) {
      return;
    }

    const { login } = await prompt<{ login: string }>({
      type: "confirm",
      name: "login",
      message: "You must be logged in to use this command. Would you like to log in?",
    });

    if (login) {
      await this.login();
    } else {
      this.exit(0);
    }
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
}
