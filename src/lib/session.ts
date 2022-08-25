import fs from "fs-extra";
import path from "path";
import { config } from "./config";
import { ignoreEnoent } from "./fs-utils";

class Session {
  private _session: string | undefined;

  get(): string | undefined {
    if (this._session) return this._session;

    try {
      this._session = fs.readFileSync(path.join(config.configDir, "session.txt"), "utf-8");
      return this._session;
    } catch (error) {
      ignoreEnoent(error);
      return undefined;
    }
  }

  /**
   * @returns Whether the session existed or not.
   */
  set(value: string | undefined): boolean {
    const hadSession = !!this.get();

    this._session = value;
    if (this._session) fs.outputFileSync(path.join(config.configDir, "session.txt"), this._session);
    else fs.removeSync(path.join(config.configDir, "session.txt"));

    return hadSession;
  }
}

export const session = new Session();
