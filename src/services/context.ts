import type { Config } from "@oclif/core";
import { addBreadcrumb, setUser, type Breadcrumb as SentryBreadcrumb } from "@sentry/node";
import assert from "assert";
import Debug from "debug";
import fs from "fs-extra";
import { HTTPError, got } from "got";
import _ from "lodash";
import path from "path";
import { ignoreEnoent } from "./fs-utils.js";

const debug = Debug("ggt:context");

export class Context {
  /**
   * A reference to oclif's {@linkcode Config}.
   *
   * By default, oclif's {@linkcode Config} is only available as an instance property on a Command, but we want to be
   * able to access it from anywhere. To do this, we created this global variable that references the Config. It is set
   * by the init function in the BaseCommand.
   */
  config!: Config;

  /**
   * Captures the name and nature of the environment
   */
  env = {
    get value(): string {
      return process.env["GGT_ENV"] ?? "production";
    },
    get productionLike(): boolean {
      return _.startsWith(this.value, "production");
    },
    get developmentLike(): boolean {
      return _.startsWith(this.value, "development");
    },
    get testLike(): boolean {
      return _.startsWith(this.value, "test");
    },
    get developmentOrTestLike(): boolean {
      return this.developmentLike || this.testLike;
    },
  };

  /**
   * Domains for various Gadget services.
   */
  domains = {
    /**
     * The domain for the Gadget applications. This is where the user applications are hosted.
     */
    app: process.env["GGT_GADGET_APP_DOMAIN"] ?? (this.env.productionLike ? "gadget.app" : "ggt.pub"),

    /**
     * The domain for the Gadget services. This is where the Gadget's API is hosted.
     */
    services: process.env["GGT_GADGET_SERVICES_DOMAIN"] ?? (this.env.productionLike ? "app.gadget.dev" : "app.ggt.dev"),
  };

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
          options.headers["user-agent"] = this.config.userAgent;
          if (options.url instanceof URL && options.url.host === this.domains.services && this.session) {
            options.headers["cookie"] = `session=${encodeURIComponent(this.session)};`;
          }
        },
      ],
    },
  });

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

  /**
   * @returns The list of Gadget applications the current user has access to.
   */
  async getAvailableApps(): Promise<App[]> {
    if (!this.session) return [];
    if (this._availableApps.length > 0) return this._availableApps;

    this._availableApps = await this._request(`https://${this.domains.services}/auth/api/apps`).json<App[]>();
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

  addBreadcrumb(breadcrumb: Breadcrumb) {
    debug("breadcrumb %O", breadcrumb);

    // clone any objects in the data so that we get a snapshot of the object at the time the breadcrumb was added
    if (breadcrumb.data) {
      for (const [key, value] of Object.entries(breadcrumb.data)) {
        if (_.isObjectLike(value)) {
          breadcrumb.data[key] = _.cloneDeep(value);
        }
      }
    }

    addBreadcrumb(breadcrumb);
  }
}

export const context = new Context();

export interface Breadcrumb extends SentryBreadcrumb {
  category: "command" | "client" | "sync";
  message: Capitalize<string>;
}

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
