import getPort from "get-port";
import got, { HTTPError } from "got";
import type { Server } from "http";
import { createServer } from "http";
import open from "open";
import { Config } from "./config";
import { Env } from "./env";
import { logger } from "./logger";

/**
 * Makes calls to gadget without specifying an app.
 */
export class Api {
  static readonly ENDPOINT = Env.productionLike ? "https://app.gadget.dev" : "https://app.ggt.dev:3000";

  static get headers() {
    const headers: Record<string, string | string[]> = {};
    if (Config.session) headers["cookie"] = `session=${encodeURIComponent(Config.session)};`;
    return headers;
  }

  static async getCurrentUser(): Promise<User | undefined> {
    if (!Config.session) return undefined;

    try {
      return await got(`${this.ENDPOINT}/auth/api/current-user`, { headers: this.headers }).json<User>();
    } catch (error) {
      if (error instanceof HTTPError && error.response.statusCode === 401) {
        Config.session = undefined;
        Config.save();
        return undefined;
      }
      throw error;
    }
  }

  static async login(): Promise<void> {
    let server: Server | undefined;

    try {
      const port = await getPort();
      const receiveSession = new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        server = createServer(async (req, res) => {
          const redirectTo = new URL(`${this.ENDPOINT}/auth/cli`);

          try {
            if (!req.url) throw new Error("missing url");
            const incomingUrl = new URL(req.url, `http://localhost:${port}`);

            const session = incomingUrl.searchParams.get("session");
            if (!session) throw new Error("missing session");

            Config.session = session;

            const user = await this.getCurrentUser();
            if (!user) throw new Error("missing current user");

            if (user.name) {
              logger.info(`👋 Hello, ${user.name} (${user.email})`);
            } else {
              logger.info(`👋 Hello, ${user.email}`);
            }

            Config.save();

            redirectTo.searchParams.set("success", "true");
            resolve();
          } catch (error) {
            redirectTo.searchParams.set("success", "false");
            reject(error);
          } finally {
            res.writeHead(303, { Location: redirectTo.toString() });
            res.end();
          }
        });

        server.listen(port);
      });

      const url = new URL(`${this.ENDPOINT}/auth/login`);
      url.searchParams.set("returnTo", `${this.ENDPOINT}/auth/cli/callback?port=${port}`);
      await open(url.toString());

      logger.info("Your browser has been opened. Please log in to your account.");

      await receiveSession;
    } finally {
      server?.close();
    }
  }
}

export interface User {
  email: string;
  name?: string;
}
