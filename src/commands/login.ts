import getPort from "get-port";
import assert from "node:assert";
import http, { type Server } from "node:http";
import open from "open";
import type { Command, Usage } from "../services/command/command.js";
import { config } from "../services/config/config.js";
import { createLogger } from "../services/output/log/logger.js";
import { sprint } from "../services/output/sprint.js";
import { writeSession } from "../services/user/session.js";
import { getUser } from "../services/user/user.js";

const log = createLogger({ name: "login" });

export const usage: Usage = () => sprint`
    Log in to your account.

    {bold USAGE}
      ggt login

    {bold EXAMPLES}
      $ ggt login
        We've opened Gadget's login page using your default browser.

        Please log in and then return to this terminal.

        Hello, Jane Doe (jane@example.com)
`;

export const login = async (): Promise<void> => {
  let server: Server | undefined;

  try {
    const port = await getPort();
    const receiveSession = new Promise<void>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      server = http.createServer(async (req, res) => {
        const landingPage = new URL(`https://${config.domains.services}/auth/cli`);

        try {
          assert(req.url, "missing url");
          const session = new URL(req.url, `http://localhost:${port}`).searchParams.get("session");
          assert(session, "missing session");

          writeSession(session);

          const user = await getUser();
          assert(user, "missing user after successful login");

          if (user.name) {
            log.printlns`Hello, ${user.name} {gray (${user.email})}`;
          } else {
            log.printlns`Hello, ${user.email}`;
          }

          landingPage.searchParams.set("success", "true");
          resolve();
        } catch (error) {
          writeSession(undefined);
          landingPage.searchParams.set("success", "false");
          reject(error);
        } finally {
          res.writeHead(303, { Location: landingPage.toString() });
          res.end();
        }
      });

      log.info("starting login server", { port });
      server.listen(port);
    });

    // open the login page in the user's default browser have it
    // redirect to the cli callback route. The cli callback route will
    // send the session to the server we just started.
    const url = new URL(`https://${config.domains.services}/auth/login`);
    url.searchParams.set("returnTo", `https://${config.domains.services}/auth/cli/callback?port=${port}`);

    try {
      await open(url.toString());
      log.printlns`
        We've opened Gadget's login page using your default browser.

        Please log in and then return to this terminal.
    `;
    } catch (error) {
      log.error("failed to open browser", { error });
      log.printlns`
        Please open the following URL in your browser and log in:

          {gray ${url.toString()}}

        Once logged in, return to this terminal.
      `;
    }

    await receiveSession;
  } finally {
    server?.close();
  }
};

export const command: Command = login;
