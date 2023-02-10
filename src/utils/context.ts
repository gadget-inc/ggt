import type { Config } from "@oclif/core";
import assert from "assert";
import fs from "fs-extra";
import got, { HTTPError } from "got";
import { isString } from "lodash";
import path from "path";
import { ignoreEnoent } from "./fs-utils";

export class Context {
  /**
   * A reference to oclif's {@linkcode Config}.
   *
   * By default, oclif's {@linkcode Config} is only available as an instance property on a Command, but we want to be able to access it from
   * anywhere. To do this, we created this global variable that references the Config. It is set by the init function in the BaseCommand.
   */
  config!: Config;

  env = new Env();

  app?: App;

  domains: {
    app: string;
    services: string;
  };

  private _session?: string;

  private _user?: User;

  private _availableApps: App[] = [];

  private _request = got.extend({
    hooks: {
      beforeRequest: [
        (options) => {
          options.headers["user-agent"] = this.config.userAgent;
          if (options.url.host === this.domains.services && this.session) {
            options.headers["cookie"] = `session=${encodeURIComponent(this.session)};`;
          }
        },
      ],
    },
  });

  constructor() {
    this.domains = {
      app: process.env["GGT_GADGET_APP_DOMAIN"] || (this.env.productionLike ? "gadget.app" : "ggt.pub"),
      services: process.env["GGT_GADGET_SERVICES_DOMAIN"] || (this.env.productionLike ? "app.gadget.dev" : "app.ggt.dev"),
    };
  }

  get session(): string | undefined {
    if (this._session) return this._session;

    try {
      this._session = fs.readFileSync(path.join(this.config.configDir, "session.txt"), "utf-8");
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
      fs.outputFileSync(path.join(this.config.configDir, "session.txt"), this._session);
    } else {
      fs.removeSync(path.join(this.config.configDir, "session.txt"));
    }
  }

  /**
   * @returns The current user, or undefined if the user is not logged in.
   */
  async getUser(): Promise<User | undefined> {
    if (!this.session) return undefined;
    if (this._user) return this._user;

    try {
      this._user = await this._request(`https://${this.domains.services}/auth/api/current-user`).json<User>();
      return this._user;
    } catch (error) {
      if (error instanceof HTTPError && error.response.statusCode === 401) {
        this.session = undefined;
        return undefined;
      }
      throw error;
    }
  }

  /**
   * @returns The list of Gadget applications the current user has access to.
   */
  async getAvailableApps(): Promise<App[]> {
    if (!this.session) return [];
    if (this._availableApps.length > 0) return this._availableApps;

    this._availableApps = await this._request(`https://${this.domains.services}/auth/api/apps`).json<App[]>();
    return this._availableApps;
  }

  async setApp(value: App | string | undefined): Promise<void> {
    if (isString(value)) {
      const app = await this.getAvailableApps().then((apps) => apps.find((app) => app.name == value || app.slug == value));
      assert(app, `attempted to set app to "${value}" but no app with that name or slug was found`);
      this.app = app;
    } else {
      this.app = value;
    }
  }

  clear(): void {
    this._session = undefined;
    this._user = undefined;
    this.app = undefined;
    this._availableApps = [];
  }
}

/**
 * Captures the name and nature of the environment
 */
class Env {
  get value(): string {
    return process.env["GGT_ENV"] || "production";
  }

  get productionLike(): boolean {
    return this.value.startsWith("production");
  }

  get developmentLike(): boolean {
    return this.value.startsWith("development");
  }

  get testLike(): boolean {
    return this.value.startsWith("test");
  }

  get developmentOrTestLike(): boolean {
    return this.developmentLike || this.testLike;
  }
}

export interface User {
  id: string | number;
  email: string;
  name?: string;
}

export interface App {
  id: string | number;
  name: string;
  slug: string;
  hasSplitEnvironments: boolean;
}

export const context = new Context();
