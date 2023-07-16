import getPort from "get-port";
import _ from "lodash";
import http from "node:http";
import open from "open";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../../src/commands/login.js";
import { context } from "../../src/services/context.js";
import { sleepUntil } from "../../src/services/sleep.js";
import { expectStdout } from "../util.js";

describe("login", () => {
  let port: number;
  let server: http.Server;
  let requestListener: http.RequestListener;

  beforeEach(async () => {
    port = await getPort();
    server = { listen: vi.fn(), close: vi.fn() } as any;
    vi.spyOn(http, "createServer").mockImplementation((opt, cb) => {
      requestListener = cb ?? (opt as http.RequestListener);
      return server;
    });
  });

  it("opens a browser to the login page, waits for the user to login, set's the returned session, and redirects to /auth/cli?success=true", async () => {
    context.session = undefined;
    vi.spyOn(context, "getUser").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });

    void run();

    await sleepUntil(() => http.createServer.mock.calls.length > 0);
    expect(getPort).toHaveBeenCalled();
    expect(requestListener!).toBeDefined();
    expect(server.listen).toHaveBeenCalledWith(port);
    expect(open).toHaveBeenCalledWith(
      `https://${context.domains.services}/auth/login?returnTo=${encodeURIComponent(
        `https://${context.domains.services}/auth/cli/callback?port=${port}`,
      )}`,
    );
    expectStdout().toMatchInlineSnapshot(`
      "We've opened Gadget's login page using your default browser.

      Please log in and then return to this terminal.

      "
    `);

    // we should be at `await receiveSession`
    expect(context.session).toBeUndefined();
    expect(context.getUser).not.toHaveBeenCalled();

    const req = new http.IncomingMessage(null as any);
    req.url = `?session=test`;

    const res = new http.ServerResponse(req);
    vi.spyOn(res, "writeHead");
    vi.spyOn(res, "end");

    requestListener!(req, res);

    await sleepUntil(() => server.close.mock.calls.length > 0);
    expect(context.session).toBe("test");
    expect(context.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "We've opened Gadget's login page using your default browser.

      Please log in and then return to this terminal.

      Hello, Jane Doe (test@example.com)

      "
    `);
    expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `https://${context.domains.services}/auth/cli?success=true` });
    expect(res.end).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });

  it("redirects to /auth/cli?success=false if an error occurs while setting the session", async () => {
    context.session = undefined;
    vi.spyOn(context, "getUser").mockRejectedValue(new Error("boom"));

    void run().catch(_.noop);

    await sleepUntil(() => http.createServer.mock.calls.length > 0);
    expect(getPort).toHaveBeenCalled();
    expect(requestListener!).toBeDefined();
    expect(server.listen).toHaveBeenCalledWith(port);
    expect(open).toHaveBeenCalledWith(
      `https://${context.domains.services}/auth/login?returnTo=${encodeURIComponent(
        `https://${context.domains.services}/auth/cli/callback?port=${port}`,
      )}`,
    );
    expectStdout().toMatchInlineSnapshot(`
      "We've opened Gadget's login page using your default browser.

      Please log in and then return to this terminal.

      "
    `);

    // we should be at `await receiveSession`
    expect(context.session).toBeUndefined();
    expect(context.getUser).not.toHaveBeenCalled();

    const req = new http.IncomingMessage(null as any);
    req.url = `?session=test`;

    const res = new http.ServerResponse(req);
    vi.spyOn(res, "writeHead");
    vi.spyOn(res, "end");

    requestListener!(req, res);

    await sleepUntil(() => server.close.mock.calls.length > 0);
    expect(context.session).toBeUndefined();
    expect(context.getUser).toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `https://${context.domains.services}/auth/cli?success=false` });
    expect(res.end).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });
});
