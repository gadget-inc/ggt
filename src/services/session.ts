import fs from "fs-extra";
import path from "node:path";
import { config } from "./config.js";
import { swallowEnoent } from "./fs.js";
import { createLogger } from "./log.js";

const log = createLogger("session");

/**
 * Reads the session from either the environment variable `GGT_SESSION`
 * or from the `session.txt` file in the config directory.
 *
 * @returns The session string if found, otherwise undefined.
 */
export const readSession = (): string | undefined => {
  if (process.env["GGT_SESSION"]) {
    log.debug("reading session from env");
    return process.env["GGT_SESSION"];
  }

  try {
    log.debug("reading session from disk");
    return fs.readFileSync(path.join(config.configDir, "session.txt"), "utf-8");
  } catch (error) {
    swallowEnoent(error);
    return undefined;
  }
};

/**
 * Writes the session to disk in the `session.txt` file in the config.
 *
 * @param session - The session to write to disk.
 */
export const writeSession = (session: string | undefined): void => {
  if (process.env["GGT_SESSION"]) {
    log.debug("writing session to env", { session: Boolean(session) });
    process.env["GGT_SESSION"] = session;
  }

  log.debug("writing session to disk", { session: Boolean(session) });

  if (session) {
    fs.outputFileSync(path.join(config.configDir, "session.txt"), session);
  } else {
    fs.removeSync(path.join(config.configDir, "session.txt"));
  }
};
