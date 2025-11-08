import getPort from "get-port";
import assert from "node:assert";
import http, { type Server } from "node:http";
import open from "open";
import type { Run, Usage } from "../services/command/command.js";
import { config } from "../services/config/config.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";
import { writeSession } from "../services/user/session.js";
import { getUser } from "../services/user/user.js";

export const usage: Usage = () => sprint`
    Log in to your account.

    {bold Usage}
          ggt login
`;

export const run: Run = async (ctx): Promise<void> => {
  let server: Server | undefined;

  try {
    const port = await getPort();
    const receiveSession = new Promise<void>((resolve, reject) => {
      // oxlint-disable-next-line no-misused-promises
      server = http.createServer(async (req, res) => {
        const landingPage = new URL(`https://${config.domains.services}/auth/cli`);

        try {
          assert(req.url, "missing url");
          const session = new URL(req.url, `http://localhost:${port}`).searchParams.get("session");
          assert(session, "missing session");

          writeSession(ctx, session);

          const user = await getUser(ctx);
          assert(user, "missing user after successful login");

          if (user.name) {
            println({ ensureEmptyLineAbove: true, content: sprint`Hello, ${user.name} {gray (${user.email})}` });
          } else {
            println({ ensureEmptyLineAbove: true, content: `Hello, ${user.email}` });
          }

          landingPage.searchParams.set("success", "true");
          resolve();
        } catch (error) {
          writeSession(ctx, undefined);
          landingPage.searchParams.set("success", "false");
          reject(error as Error);
        } finally {
          res.writeHead(303, { Location: landingPage.toString() });
          res.end();
        }
      });

      ctx.log.info("starting login server", { port });
      server.listen(port);
    });

    // open the login page in the user's default browser have it
    // redirect to the cli callback route. The cli callback route will
    // send the session to the server we just started.
    const url = new URL(`https://${config.domains.services}/auth/login`);
    url.searchParams.set("returnTo", `https://${config.domains.services}/auth/cli/callback?port=${port}`);

    try {
      ctx.log.info("opening browser", { url: url.toString() });
      await open(url.toString());
      println({
        ensureEmptyLineAbove: true,
        content: sprint`
          We've opened Gadget's login page using your default browser.

          Please log in and then return to this terminal.
        `,
      });
    } catch (error) {
      ctx.log.error("failed to open browser", { error });
      println({
        ensureEmptyLineAbove: true,
        content: sprint`
          Please open the following URL in your browser and log in:

            {gray ${url.toString()}}

          Once logged in, return to this terminal.
        `,
      });
    }

    await receiveSession;
  } finally {
    server?.close();
  }
};

// alias
export const login = run;
