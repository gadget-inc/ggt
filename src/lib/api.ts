import got, { HTTPError } from "got";
import { config } from "./config";
import { Env } from "./env";
import { session } from "./session";

export const GADGET_ENDPOINT = Env.productionLike ? "https://app.gadget.dev" : "https://app.ggt.dev:3000";

class Api {
  private _client = got.extend({
    hooks: {
      beforeRequest: [
        (options) => {
          options.headers["user-agent"] = config.userAgent;
          if (options.url.origin === GADGET_ENDPOINT) {
            const ses = session.get();
            if (ses) options.headers["cookie"] = `session=${encodeURIComponent(ses)};`;
          }
        },
      ],
    },
  });

  /**
   * @returns The current user, or undefined if the user is not logged in.
   */
  async getCurrentUser(): Promise<User | undefined> {
    if (!session.get()) return undefined;

    try {
      return await this._client(`${GADGET_ENDPOINT}/auth/api/current-user`).json<User>();
    } catch (error) {
      if (error instanceof HTTPError && error.response.statusCode === 401) {
        session.set(undefined);
        return undefined;
      }
      throw error;
    }
  }

  /**
   * @returns The list of Gadget applications the current user has access to.
   */
  async getApps(): Promise<App[]> {
    if (!session.get()) return [];

    return await this._client(`${GADGET_ENDPOINT}/auth/api/apps`).json<App[]>();
  }
}

export const api = new Api();

export interface User {
  email: string;
  name?: string;
}

export interface App {
  id: string;
  name: string;
  slug: string;
}
