import fs from "fs-extra";
import path from "path";
import { ignoreEnoent } from "./enoent";
import { Env } from "./env";

type WrittenConfig = { session?: string };

/**
 * Holds the configuration of the CLI.
 */
export class Config {
  /**
   * The session token of the user.
   */
  static session?: string;

  /**
   * The path to the configuration file.
   */
  static get filepath(): string {
    return path.join(Env.paths.config, "config.json");
  }

  /**
   * Saves the configuration to the filesystem.
   */
  static save(this: void): void {
    const config: WrittenConfig = { session: Config.session };
    fs.outputJsonSync(Config.filepath, config, { spaces: 2, mode: 0o600 });
  }

  /**
   * Reloads the configuration from the filesystem.
   */
  static reload(): void {
    try {
      const config = fs.readJSONSync(Config.filepath) as WrittenConfig;
      Config.session = config.session;
    } catch (error) {
      ignoreEnoent(error);
      Config.session = undefined;
    }
  }
}

Config.reload();
