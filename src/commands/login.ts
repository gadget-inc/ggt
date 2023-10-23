import getPort from "get-port";
import assert from "node:assert";
import http, { type Server } from "node:http";
import open from "open";
import { config } from "../services/config.js";
import { createLogger } from "../services/log.js";
import { println, sprint } from "../services/output.js";
import { writeSession } from "../services/session.js";
import { getUser } from "../services/user.js";

export const usage = sprint`
    Log in to your account.

    {bold USAGE}
      $ ggt login

    {bold EXAMPLES}
      {gray $ ggt login}
      We've opened Gadget's login page using your default browser.

      Please log in and then return to this terminal.

      Hello, Jane Doe (jane@example.com)
`;

const log = createLogger("login");

export const run = async () => {
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
            println`Hello, ${user.name} {gray (${user.email})}`;
          } else {
            println`Hello, ${user.email}`;
          }
          println();

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
    await open(url.toString());

    println`
        We've opened Gadget's login page using your default browser.

        Please log in and then return to this terminal.\n
    `;

    await receiveSession;
  } finally {
    server?.close();
  }
};
