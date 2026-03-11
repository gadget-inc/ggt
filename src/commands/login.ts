import assert from "node:assert";
import http, { type Server } from "node:http";

import getPort from "get-port";
import open from "open";

import { defineCommand } from "../services/command/command.js";
import { config } from "../services/config/config.js";
import colors from "../services/output/colors.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";
import { writeSession } from "../services/user/session.js";
import { getUser } from "../services/user/user.js";

export default defineCommand({
  name: "login",
  description: "Log in to Gadget",
  details: sprint`
    Opens the Gadget login page in your default browser. After you authenticate,
    the session token is stored locally so subsequent commands can use it. If the
    browser cannot be opened, a URL is printed for you to visit manually.
  `,
  examples: ["ggt login"],
  run: async (ctx) => {
    let server: Server | undefined;

    try {
      const port = await getPort();
      const receiveSession = new Promise<void>((resolve, reject) => {
        // oxlint-disable-next-line no-misused-promises
        server = http.createServer(async (req, res) => {
          const session = req.url ? new URL(req.url, `http://localhost:${port}`).searchParams.get("session") : null;
          if (!session) {
            // Ignore spurious requests (favicon, health checks, port-forwarding probes)
            res.writeHead(404);
            res.end();
            return;
          }

          const landingPage = new URL(`https://${config.domains.services}/auth/cli`);

          try {
            writeSession(ctx, session);

            const user = await getUser(ctx);
            assert(user, "missing user after successful login");

            if (user.name) {
              println({ ensureEmptyLineAbove: true, content: sprint`Hello, ${user.name} ${colors.subdued(`(${user.email})`)}` });
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

              ${colors.hint(url.toString())}

            Once logged in, return to this terminal.
          `,
        });
      }

      await receiveSession;
    } finally {
      server?.close();
    }
  },
});
