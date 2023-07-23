import getPort from "get-port";
import _ from "lodash";
import http from "node:http";
import open from "open";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../../src/commands/login.js";
import { config } from "../../src/services/config.js";
import { Context } from "../../src/services/context.js";
import { sleepUntil } from "../../src/services/sleep.js";
import { expectStdout } from "../util.js";

describe("login", () => {
  let ctx: Context;
  let port: number;
  let server: http.Server;
  let requestListener: http.RequestListener;

  beforeEach(async () => {
    ctx = new Context();
    port = await getPort();
    server = { listen: vi.fn(), close: vi.fn() } as any;
    vi.spyOn(http, "createServer").mockImplementation((opt, cb) => {
      requestListener = cb ?? (opt as http.RequestListener);
      return server;
    });
  });

  it("opens a browser to the login page, waits for the user to login, set's the returned session, and redirects to /auth/cli?success=true", async () => {
    ctx.session = undefined;
    vi.spyOn(ctx, "getUser").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });

    void run(ctx);

    await sleepUntil(() => http.createServer.mock.calls.length > 0);
    expect(getPort).toHaveBeenCalled();
    expect(requestListener!).toBeDefined();
    expect(server.listen).toHaveBeenCalledWith(port);
    expect(open).toHaveBeenCalledWith(
      `https://${config.domains.services}/auth/login?returnTo=${encodeURIComponent(
        `https://${config.domains.services}/auth/cli/callback?port=${port}`,
      )}`,
    );
    expectStdout().toMatchInlineSnapshot(`
      "We've opened Gadget's login page using your default browser.

      Please log in and then return to this terminal.

      "
    `);

    // we should be at `await receiveSession`
    expect(ctx.session).toBeUndefined();
    expect(ctx.getUser).not.toHaveBeenCalled();

    const req = new http.IncomingMessage(null as any);
    req.url = `?session=test`;

    const res = new http.ServerResponse(req);
    vi.spyOn(res, "writeHead");
    vi.spyOn(res, "end");

    requestListener!(req, res);

    await sleepUntil(() => server.close.mock.calls.length > 0);
    expect(ctx.session).toBe("test");
    expect(ctx.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "We've opened Gadget's login page using your default browser.

      Please log in and then return to this terminal.

      Hello, Jane Doe (test@example.com)

      "
    `);
    expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `https://${config.domains.services}/auth/cli?success=true` });
    expect(res.end).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });

  it("redirects to /auth/cli?success=false if an error occurs while setting the session", async () => {
    ctx.session = undefined;
    vi.spyOn(ctx, "getUser").mockRejectedValue(new Error("boom"));

    void run(ctx).catch(_.noop);

    await sleepUntil(() => http.createServer.mock.calls.length > 0);
    expect(getPort).toHaveBeenCalled();
    expect(requestListener!).toBeDefined();
    expect(server.listen).toHaveBeenCalledWith(port);
    expect(open).toHaveBeenCalledWith(
      `https://${config.domains.services}/auth/login?returnTo=${encodeURIComponent(
        `https://${config.domains.services}/auth/cli/callback?port=${port}`,
      )}`,
    );
    expectStdout().toMatchInlineSnapshot(`
      "We've opened Gadget's login page using your default browser.

      Please log in and then return to this terminal.

      "
    `);

    // we should be at `await receiveSession`
    expect(ctx.session).toBeUndefined();
    expect(ctx.getUser).not.toHaveBeenCalled();

    const req = new http.IncomingMessage(null as any);
    req.url = `?session=test`;

    const res = new http.ServerResponse(req);
    vi.spyOn(res, "writeHead");
    vi.spyOn(res, "end");

    requestListener!(req, res);

    await sleepUntil(() => server.close.mock.calls.length > 0);
    expect(ctx.session).toBeUndefined();
    expect(ctx.getUser).toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `https://${config.domains.services}/auth/cli?success=false` });
    expect(res.end).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });
});
