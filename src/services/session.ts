import fs from "fs-extra";
import path from "node:path";
import { breadcrumb } from "./breadcrumbs.js";
import { config } from "./config.js";
import { ignoreEnoent as swallowEnoent } from "./fs-utils.js";

export const readSession = (): string | undefined => {
  breadcrumb({
    type: "debug",
    category: "session",
    message: "Reading session from disk",
  });

  try {
    return fs.readFileSync(path.join(config.configDir, "session.txt"), "utf-8");
  } catch (error) {
    swallowEnoent(error);
    return undefined;
  }
};

export const writeSession = (session: string | undefined) => {
  breadcrumb({
    type: "debug",
    category: "session",
    message: "Writing session to disk",
    data: { session: Boolean(session) },
  });

  if (session) {
    fs.outputFileSync(path.join(config.configDir, "session.txt"), session);
  } else {
    fs.removeSync(path.join(config.configDir, "session.txt"));
  }
};
