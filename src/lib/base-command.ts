import type { Config } from "@oclif/core";
import { Command, Flags } from "@oclif/core";
import { CLIError } from "@oclif/errors";
import Debug from "debug";
import fs from "fs-extra";
import getPort from "get-port";
import type { Got } from "got";
import got, { HTTPError } from "got";
import type { Server } from "http";
import { createServer } from "http";
import { prompt } from "inquirer";
import open from "open";
import path from "path";
import { Client } from "./client";
import { Env } from "./env";
import { ignoreEnoent } from "./fs-utils";
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
    debug: Flags.boolean({
      char: "D",
      summary: "Whether to output debug information.",
      helpGroup: "global",
      default: false,
    }),
  };

  /**
   * Indicates whether the command is being run with the `-D/--debug` flag.
   */
  debugEnabled = false;

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
   * The HTTP client to use for all HTTP requests.
   *
   * If a request is made to Gadget, the session token will be added to the request's headers.
   */
  readonly http: Got;

  /**
   * The GraphQL client to use for all Gadget API requests.
   *
   * Will be `undefined` if the user is not logged in or if the user has not selected an app.
   *
   * @see {@linkcode requireApp requireApp}
   */
  client!: Client;

  private _session?: string;

  constructor(argv: string[], config: Config) {
    super(argv, config);

    this.http = got.extend({
      hooks: {
        beforeRequest: [
          (options) => {
            options.headers["user-agent"] = this.config.userAgent;
            if (options.url.origin === ENDPOINT && this.session) {
              options.headers = { ...options.headers, cookie: `session=${encodeURIComponent(this.session)};` };
            }
          },
        ],
      },
    });
  }

  get session(): string | undefined {
    try {
      return (this._session ??= fs.readFileSync(path.join(this.config.configDir, "session.txt"), "utf-8"));
    } catch (error) {
      ignoreEnoent(error);
      return undefined;
    }
  }

  set session(value: string | undefined) {
    this._session = value;
    if (value) {
      fs.outputFileSync(path.join(this.config.configDir, "session.txt"), value);
    } else {
      fs.removeSync(path.join(this.config.configDir, "session.txt"));
    }
  }

  override async init(): Promise<void> {
    await super.init();
    const { flags, argv } = await this.parse({ flags: BaseCommand.globalFlags, strict: false });

    // remove global flags from argv
    this.argv = argv;

    if (flags.debug) {
      this.debugEnabled = true;
      Debug.enable(`${this.config.bin}:*`);
    }

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
          cookie: `session=${encodeURIComponent(this.session as string)};`,
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

            this.session = session;

            const user = await this.getCurrentUser();
            if (!user) throw new Error("missing current user");

            if (user.name) {
              this.log(`Hello, ${user.name} (${user.email})`);
            } else {
              this.log(`Hello, ${user.email}`);
            }

            redirectTo.searchParams.set("success", "true");
            resolve();
          } catch (error) {
            this.session = undefined;
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

      this.log("Your browser has been opened. Please log in to your account.");

      await receiveSession;
    } finally {
      server?.close();
    }
  }

  /**
   * @returns Whether the user was logged in or not.
   */
  logout(): boolean {
    if (!this.session) return false;

    this.session = undefined;
    return true;
  }

  /**
   * @returns The current user, or undefined if the user is not logged in.
   */
  async getCurrentUser(): Promise<User | undefined> {
    if (!this.session) return undefined;

    try {
      return await this.http(`${ENDPOINT}/auth/api/current-user`).json<User>();
    } catch (error) {
      if (error instanceof HTTPError && error.response.statusCode === 401) {
        this.logout();
        return undefined;
      }
      throw error;
    }
  }

  /**
   * @returns A list of Gadget apps that the user has access to.
   */
  async getApps(): Promise<App[]> {
    if (!this.session) return [];

    return await this.http(`${ENDPOINT}/auth/api/apps`).json<App[]>();
  }
}
