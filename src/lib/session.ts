import fs from "fs-extra";
import path from "path";
import { config } from "./config";
import { ignoreEnoent } from "./fs-utils";

let session: string | undefined = undefined;

export function getSession(): string | undefined {
  if (session) return session;

  try {
    session = fs.readFileSync(path.join(config.configDir, "session.txt"), "utf-8");
    return session;
  } catch (error) {
    ignoreEnoent(error);
    return undefined;
  }
}

export function setSession(value: string | undefined): void {
  session = value;
  if (session) fs.outputFileSync(path.join(config.configDir, "session.txt"), session);
  else fs.removeSync(path.join(config.configDir, "session.txt"));
}
