import fs from "fs-extra";
import path from "node:path";
import { config } from "./config.js";
import { swallowEnoent } from "./fs.js";
import { createLogger } from "./log.js";

const log = createLogger("session");

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

export const writeSession = (session: string | undefined): void => {
  log.debug("writing session to disk", { session: Boolean(session) });

  if (session) {
    fs.outputFileSync(path.join(config.configDir, "session.txt"), session);
  } else {
    fs.removeSync(path.join(config.configDir, "session.txt"));
  }
};
