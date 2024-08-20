import fs from "fs-extra";
import type { Context } from "../command/context.js";
import { configPath } from "../config/config.js";
import { swallowEnoent } from "../filesync/directory.js";
import { memo } from "../util/function.js";

/**
 * Reads the session from either the environment variable `GGT_SESSION`
 * or from the `session.txt` file in the config directory.
 *
 * @returns The session string if found, otherwise undefined.
 */
export const readSession = memo((ctx: Context): string | undefined => {
  if (process.env["GGT_SESSION"]) {
    ctx.log.debug("reading session from env");
    return process.env["GGT_SESSION"];
  }

  try {
    ctx.log.debug("reading session from disk");
    return fs.readFileSync(configPath("session.txt"), "utf8");
  } catch (error) {
    swallowEnoent(error);
    return undefined;
  }
});

/**
 * Writes the session to disk in the `session.txt` file in the config.
 *
 * @param ctx - The context object.
 * @param session - The session to write to disk.
 */
export const writeSession = (ctx: Context, session: string | undefined): void => {
  readSession.clear();

  if (process.env["GGT_SESSION"]) {
    ctx.log.debug("writing session to env", { session: Boolean(session) });
    process.env["GGT_SESSION"] = session;
  }

  ctx.log.debug("writing session to disk", { session: Boolean(session), path: configPath("session.txt") });

  if (session) {
    fs.outputFileSync(configPath("session.txt"), session);
  } else {
    fs.removeSync(configPath("session.txt"));
  }
};

export const readToken = memo((ctx: Context): string | undefined => {
  ctx.log.debug("reading token from env");
  return process.env["GGT_TOKEN"];
});
