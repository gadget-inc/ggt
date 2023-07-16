import getPort from "get-port";
import type { Server } from "node:http";
import http from "node:http";
import open from "open";
import { context } from "../services/context.js";
import { println, sprint } from "../services/output.js";

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

export const run = async () => {
  let server: Server | undefined;

  try {
    const port = await getPort();
    const receiveSession = new Promise<void>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      server = http.createServer(async (req, res) => {
        const redirectTo = new URL(`https://${context.domains.services}/auth/cli`);

        try {
          if (!req.url) throw new Error("missing url");
          const incomingUrl = new URL(req.url, `http://localhost:${port}`);

          const value = incomingUrl.searchParams.get("session");
          if (!value) throw new Error("missing session");

          context.session = value;

          const user = await context.getUser();
          if (!user) throw new Error("missing current user");

          if (user.name) {
            println`Hello, ${user.name} {gray (${user.email})}`;
          } else {
            println`Hello, ${user.email}`;
          }
          println();

          redirectTo.searchParams.set("success", "true");
          resolve();
        } catch (error) {
          context.session = undefined;
          redirectTo.searchParams.set("success", "false");
          reject(error);
        } finally {
          res.writeHead(303, { Location: redirectTo.toString() });
          res.end();
        }
      });

      server.listen(port);
    });

    const url = new URL(`https://${context.domains.services}/auth/login`);
    url.searchParams.set("returnTo", `https://${context.domains.services}/auth/cli/callback?port=${port}`);
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
