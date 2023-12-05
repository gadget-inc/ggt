import fs from "fs-extra";
import { configPath } from "../config/config.js";
import { swallowEnoent } from "../filesync/directory.js";
import { createLogger } from "../output/log/logger.js";
import { memo } from "../util/function.js";

const log = createLogger({ name: "session" });

/**
 * Reads the session from either the environment variable `GGT_SESSION`
 * or from the `session.txt` file in the config directory.
 *
 * @returns The session string if found, otherwise undefined.
 */
export const readSession = memo((): string | undefined => {
  if (process.env["GGT_SESSION"]) {
    log.debug("reading session from env");
    return process.env["GGT_SESSION"];
  }

  try {
    log.debug("reading session from disk");
    return fs.readFileSync(configPath("session.txt"), "utf8");
  } catch (error) {
    swallowEnoent(error);
    return undefined;
  }
});

/**
 * Writes the session to disk in the `session.txt` file in the config.
 *
 * @param session - The session to write to disk.
 */
export const writeSession = (session: string | undefined): void => {
  readSession.clear();

  if (process.env["GGT_SESSION"]) {
    log.debug("writing session to env", { session: Boolean(session) });
    process.env["GGT_SESSION"] = session;
  }

  log.debug("writing session to disk", { session: Boolean(session), path: configPath("session.txt") });

  if (session) {
    fs.outputFileSync(configPath("session.txt"), session);
  } else {
    fs.removeSync(configPath("session.txt"));
  }
};
