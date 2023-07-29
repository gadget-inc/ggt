import { setUser } from "@sentry/node";
import arg from "arg";
import fs from "fs-extra";
import { HTTPError, got } from "got";
import inquirer from "inquirer";
import _ from "lodash";
import assert from "node:assert";
import path from "node:path";
import process from "node:process";
import { run as login } from "../commands/login.js";
import { config } from "./config.js";
import { ignoreEnoent } from "./fs-utils.js";

export interface User {
  id: string | number;
  email: string;
  name?: string;
}

export interface App {
  id: string | number;
  slug: string;
  primaryDomain: string;
  hasSplitEnvironments: boolean;
}

export const globalArgs = arg(
  {
    "--help": Boolean,
    "-h": "--help",
    "--version": Boolean,
    "-v": "--version",
    "--debug": Boolean,
    "-d": "--debug",
  },
  {
    argv: process.argv.slice(2),
    permissive: true,
    stopAtPositional: false,
  },
);

export class Context {
  /**
   * The current Gadget application the CLI is operating on.
   */
  app?: App;

  private _session?: string;

  private _user?: User;

  private _availableApps: App[] = [];

  private _request = got.extend({
    hooks: {
      beforeRequest: [
        (options) => {
          options.headers["user-agent"] = config.versionFull;
          if (options.url instanceof URL && options.url.host === config.domains.services && this.session) {
            options.headers["cookie"] = `session=${encodeURIComponent(this.session)};`;
          }
        },
      ],
    },
  });

  get session(): string | undefined {
    if (this._session) return this._session;

    try {
      this._session = fs.readFileSync(path.join(config.configDir, "session.txt"), "utf-8");
      return this._session;
    } catch (error) {
      ignoreEnoent(error);
      return undefined;
    }
  }

  set session(value: string | undefined) {
    this.clear();
    this._session = value;
    if (this._session) {
      fs.outputFileSync(path.join(config.configDir, "session.txt"), this._session);
    } else {
      fs.removeSync(path.join(config.configDir, "session.txt"));
    }
  }

  /**
   * @returns The current user, or undefined if the user is not logged in.
   */
  async getUser(): Promise<User | undefined> {
    if (!this.session) return undefined;
    if (this._user) return this._user;

    try {
      this._user = await this._request(`https://${config.domains.services}/auth/api/current-user`).json<User>();
      setUser(this._user);
      return this._user;
    } catch (error) {
      if (error instanceof HTTPError && error.response.statusCode === 401) {
        this.session = undefined;
        return undefined;
      }
      throw error;
    }
  }

  async requireUser(): Promise<User> {
    const user = await this.getUser();
    if (user) {
      return user;
    }

    const { yes } = await inquirer.prompt<{ yes: boolean }>({
      type: "confirm",
      name: "yes",
      message: "You must be logged in to use this command. Would you like to log in?",
    });

    if (!yes) {
      process.exit(0);
    }

    await login(this);

    assert(this._user, "expected user to be logged");
    return this._user;
  }

  /**
   * @returns The list of Gadget applications the current user has access to.
   */
  async getAvailableApps(): Promise<App[]> {
    if (!this.session) return [];
    if (this._availableApps.length > 0) return this._availableApps;

    this._availableApps = await this._request(`https://${config.domains.services}/auth/api/apps`).json<App[]>();
    return this._availableApps;
  }

  async setApp(appOrSlug?: App | string): Promise<void> {
    if (_.isString(appOrSlug)) {
      const app = await this.getAvailableApps().then((apps) => _.find(apps, (app) => app.slug == appOrSlug));
      assert(app, `attempted to set app to "${appOrSlug}" but no app with that name or slug was found`);
      this.app = app;
    } else {
      this.app = appOrSlug;
    }
  }

  clear(): void {
    this._session = undefined;
    this._user = undefined;
    this.app = undefined;
    this._availableApps = [];
    setUser(null);
  }
}
