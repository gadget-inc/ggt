import { addBreadcrumb, setUser, type Breadcrumb as SentryBreadcrumb } from "@sentry/node";
import arg from "arg";
import assert from "assert";
import Debug from "debug";
import fs from "fs-extra";
import { HTTPError, got } from "got";
import inquirer from "inquirer";
import isWsl from "is-wsl";
import _ from "lodash";
import { fileURLToPath } from "node:url";
import normalizePackageData, { type Package } from "normalize-package-data";
import os from "os";
import path from "path";
import process from "process";
import { run as login } from "../commands/login.js";
import { ignoreEnoent } from "./fs-utils.js";

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

const ggtDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../");
const pkgJson = fs.readJsonSync(path.join(ggtDir, "package.json")) as Package;
normalizePackageData(pkgJson, true);

export class Context {
  globalArgs = arg(
    {
      "--help": Boolean,
      "-h": "--help",
      "--debug": Boolean,
      "-D": "--debug",
    },
    {
      argv: process.argv.slice(2),
      permissive: true,
      stopAtPositional: false,
    },
  );

  config = {
    ggtDir,

    get name(): string {
      return pkgJson.name;
    },

    get version(): string {
      return pkgJson.version;
    },

    /**
     * @example "ggt/1.2.3 (darwin-arm64) node-v16.0.0"
     */
    get versionFull(): string {
      return `${this.name}/${this.version} ${this.platform}-${this.arch} node-${process.version}`;
    },

    get arch(): string {
      return os.arch() === "ia32" ? "x86" : os.arch();
    },

    get platform(): string {
      return isWsl ? "wsl" : os.platform();
    },

    get windows(): boolean {
      return process.platform === "win32";
    },

    get macos(): boolean {
      return process.platform === "darwin";
    },

    get shell(): string | undefined {
      const SHELL = process.env["SHELL"] ?? _.split(os.userInfo().shell, path.sep).pop();
      if (SHELL) {
        return _.split(SHELL, "/").at(-1);
      }
      if (this.windows && process.env["COMSPEC"]) {
        return _.split(process.env["COMSPEC"], /\\|\//).at(-1);
      }
      return "unknown";
    },

    get homeDir(): string {
      if (process.env["HOME"]) {
        return process.env["HOME"];
      }

      if (this.windows) {
        if (process.env["HOMEDRIVE"] && process.env["HOMEPATH"]) {
          return path.join(process.env["HOMEDRIVE"], process.env["HOMEPATH"]);
        }
        if (process.env["USERPROFILE"]) {
          return process.env["USERPROFILE"];
        }
      }

      return os.homedir() || os.tmpdir();
    },

    /**
     * - Unix: `~/.config/ggt`
     * - Windows: `%LOCALAPPDATA%\ggt`
     *
     * Can be overridden by `GGT_CONFIG_DIR`
     */
    get configDir(): string {
      if (process.env["GGT_CONFIG_DIR"]) {
        return process.env["GGT_CONFIG_DIR"];
      }

      const base = process.env["XDG_CONFIG_HOME"] || (this.windows && process.env["LOCALAPPDATA"]) || path.join(this.homeDir, ".config");
      return path.join(base, "ggt");
    },

    /**
     * - Linux: `~/.cache/ggt`
     * - macOS: `~/Library/Caches/ggt`
     * - Windows: `%LOCALAPPDATA%\ggt`
     *
     * Can be overridden with `GGT_CACHE_DIR`
     */
    get cacheDir(): string {
      if (process.env["GGT_CACHE_DIR"]) {
        return process.env["GGT_CACHE_DIR"];
      }

      if (this.macos) {
        return path.join(this.homeDir, "Library/Caches/ggt");
      }

      const base = process.env["XDG_CACHE_HOME"] || (this.windows && process.env["LOCALAPPDATA"]) || path.join(this.homeDir, ".cache");
      return path.join(base, "ggt");
    },

    /**
     * - Unix: `~/.local/share/ggt`
     * - Windows: `%LOCALAPPDATA%\ggt`
     *
     * Can be overridden with `GGT_DATA_DIR`
     */
    get dataDir(): string {
      if (process.env["GGT_DATA_DIR"]) {
        return process.env["GGT_DATA_DIR"];
      }

      const base = process.env[`XDG_DATA_HOME`] || (this.windows && process.env["LOCALAPPDATA"]) || path.join(this.homeDir, ".local/share");
      return path.join(base, "ggt");
    },
  };

  /**
   * Captures the name and nature of the environment
   */
  env = {
    get value(): string {
      return process.env["GGT_ENV"] || "production";
    },

    get productionLike(): boolean {
      return !this.developmentOrTestLike;
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
     * The domain for the Gadget applications. This is where the user's application is hosted.
     */
    app: process.env["GGT_GADGET_APP_DOMAIN"] || (this.env.productionLike ? "gadget.app" : "ggt.pub"),

    /**
     * The domain for the Gadget services. This is where Gadget's API is hosted.
     */
    services: process.env["GGT_GADGET_SERVICES_DOMAIN"] || (this.env.productionLike ? "app.gadget.dev" : "app.ggt.dev"),
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
          options.headers["user-agent"] = this.config.versionFull;
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

    await login();

    assert(this._user, "expected user to be logged");
    return this._user;
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
