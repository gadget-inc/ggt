import fs from "fs-extra";
import isWsl from "is-wsl";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import normalizePackageData, { type Package } from "normalize-package-data";

/**
 * The root directory of the ggt package.
 */
export const workspaceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../");

/**
 * The package.json of the ggt package.
 */
export const pkgJson = (await fs.readJson(path.join(workspaceRoot, "package.json"))) as Package;
normalizePackageData(pkgJson, true);

/**
 * Captures the name and nature of the environment
 */
export const env = {
  get value(): string {
    return process.env["GGT_ENV"] || "production";
  },

  get productionLike(): boolean {
    return !this.developmentOrTestLike;
  },

  get developmentLike(): boolean {
    return this.value.startsWith("development");
  },

  get testLike(): boolean {
    return this.value.startsWith("test");
  },

  get developmentOrTestLike(): boolean {
    return this.developmentLike || this.testLike;
  },
};

export const config = {
  debug: false,

  get name(): string {
    return pkgJson.name;
  },

  get version(): string {
    return pkgJson.version;
  },

  /**
   * Returns the full version string including name, version, platform,
   * arch, and Node.js version. This is passed as the user agent for all
   * outgoing http requests.
   *
   * @example "ggt/1.2.3 darwin-arm64 node-v16.0.0"
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
    const SHELL = process.env["SHELL"] ?? os.userInfo().shell?.split(path.sep).pop();
    if (SHELL) {
      return SHELL.split("/").at(-1);
    }
    if (this.windows && process.env["COMSPEC"]) {
      return process.env["COMSPEC"].split(/\\|\//).at(-1);
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

    const base = process.env["XDG_DATA_HOME"] || (this.windows && process.env["LOCALAPPDATA"]) || path.join(this.homeDir, ".local/share");
    return path.join(base, "ggt");
  },

  /**
   * Domains for various Gadget services.
   */
  domains: {
    /**
     * The domain for the Gadget applications. This is where the user's application is hosted.
     */
    get app() {
      return process.env["GGT_GADGET_APP_DOMAIN"] || (env.productionLike ? "gadget.app" : "ggt.pub");
    },

    /**
     * The domain for the Gadget services. This is where Gadget's API is hosted.
     */
    get services() {
      return process.env["GGT_GADGET_SERVICES_DOMAIN"] || (env.productionLike ? "app.gadget.dev" : "app.ggt.dev");
    },
  },
};
