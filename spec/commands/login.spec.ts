import getPort from "get-port";
import http from "node:http";
import open from "open";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { command } from "../../src/commands/login.js";
import { type Context } from "../../src/services/command/context.js";
import { config } from "../../src/services/config/config.js";
import { readSession, writeSession } from "../../src/services/user/session.js";
import * as user from "../../src/services/user/user.js";
import { noop } from "../../src/services/util/function.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import { makeContext } from "../__support__/context.js";
import { expectStdout } from "../__support__/stream.js";
import { testUser } from "../__support__/user.js";

describe("login", () => {
  let ctx: Context;
  let port: number;
  let server: http.Server;
  let serverListening: PromiseSignal;
  let serverClosed: PromiseSignal;
  let requestListener: http.RequestListener;
  let openedBrowser: PromiseSignal;

  beforeEach(async () => {
    ctx = makeContext();
    port = await getPort();
    serverListening = new PromiseSignal();
    serverClosed = new PromiseSignal();
    server = { listen: vi.fn(serverListening.resolve), close: vi.fn(serverClosed.resolve) } as any;

    vi.spyOn(http, "createServer").mockImplementation((opt, cb) => {
      requestListener = cb ?? (opt as http.RequestListener);
      return server;
    });

    openedBrowser = new PromiseSignal();
    open.mockImplementationOnce(() => {
      openedBrowser.resolve();
      return Promise.resolve();
    });
  });

  it("opens a browser to the login page, waits for the user to login, set's the returned session, and redirects to /auth/cli?success=true", async () => {
    writeSession(undefined);
    vi.spyOn(user, "getUser").mockResolvedValue(testUser);

    void command(ctx);
    await serverListening;

    expect(getPort).toHaveBeenCalled();
    expect(requestListener!).toBeDefined();
    expect(server.listen).toHaveBeenCalledWith(port);
    expect(open).toHaveBeenCalledWith(
      `https://${config.domains.services}/auth/login?returnTo=${encodeURIComponent(
        `https://${config.domains.services}/auth/cli/callback?port=${port}`,
      )}`,
    );

    await openedBrowser;
    expectStdout().toMatchInlineSnapshot(`
      "
      We've opened Gadget's login page using your default browser.

      Please log in and then return to this terminal.
      "
    `);

    // we should be at `await receiveSession`
    expect(readSession()).toBeUndefined();
    expect(user.getUser).not.toHaveBeenCalled();

    const req = new http.IncomingMessage(undefined as any);
    req.url = "?session=test";

    const res = new http.ServerResponse(req);
    vi.spyOn(res, "writeHead");
    vi.spyOn(res, "end");

    requestListener!(req, res);

    await serverClosed;
    expect(readSession()).toBe("test");
    expect(user.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "
      We've opened Gadget's login page using your default browser.

      Please log in and then return to this terminal.

      Hello, Jane Doe (test@example.com)
      "
    `);
    expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `https://${config.domains.services}/auth/cli?success=true` });
    expect(res.end).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });

  it("prints the login page when open fails, waits for the user to login, set's the returned session, and redirects to /auth/cli?success=true", async () => {
    writeSession(undefined);
    vi.spyOn(user, "getUser").mockResolvedValue(testUser);

    open.mockReset();
    open.mockImplementationOnce(() => {
      openedBrowser.resolve();
      throw new Error("boom");
    });

    void command(ctx);
    await serverListening;

    expect(getPort).toHaveBeenCalled();
    expect(requestListener!).toBeDefined();
    expect(server.listen).toHaveBeenCalledWith(port);
    expect(open).toHaveBeenCalledWith(
      `https://${config.domains.services}/auth/login?returnTo=${encodeURIComponent(
        `https://${config.domains.services}/auth/cli/callback?port=${port}`,
      )}`,
    );

    await openedBrowser;
    expectStdout().toMatchInlineSnapshot(`
      "
      Please open the following URL in your browser and log in:

        https://app.ggt.dev/auth/login?returnTo=https%3A%2F%2Fapp.ggt.dev%2Fauth%2Fcli%2Fcallback%3Fport%3D1234

      Once logged in, return to this terminal.
      "
    `);

    // we should be at `await receiveSession`
    expect(readSession()).toBeUndefined();
    expect(user.getUser).not.toHaveBeenCalled();

    const req = new http.IncomingMessage(undefined as any);
    req.url = "?session=test";

    const res = new http.ServerResponse(req);
    vi.spyOn(res, "writeHead");
    vi.spyOn(res, "end");

    requestListener!(req, res);

    await serverClosed;
    expect(readSession()).toBe("test");
    expect(user.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "
      Please open the following URL in your browser and log in:

        https://app.ggt.dev/auth/login?returnTo=https%3A%2F%2Fapp.ggt.dev%2Fauth%2Fcli%2Fcallback%3Fport%3D1234

      Once logged in, return to this terminal.

      Hello, Jane Doe (test@example.com)
      "
    `);
    expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `https://${config.domains.services}/auth/cli?success=true` });
    expect(res.end).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });

  it("redirects to /auth/cli?success=false if an error occurs while setting the session", async () => {
    writeSession(undefined);
    vi.spyOn(user, "getUser").mockRejectedValue(new Error("boom"));

    void Promise.resolve(command(ctx)).catch(noop);
    await serverListening;

    expect(getPort).toHaveBeenCalled();
    expect(requestListener!).toBeDefined();
    expect(server.listen).toHaveBeenCalledWith(port);
    expect(open).toHaveBeenCalledWith(
      `https://${config.domains.services}/auth/login?returnTo=${encodeURIComponent(
        `https://${config.domains.services}/auth/cli/callback?port=${port}`,
      )}`,
    );

    await openedBrowser;
    expectStdout().toMatchInlineSnapshot(`
      "
      We've opened Gadget's login page using your default browser.

      Please log in and then return to this terminal.
      "
    `);

    // we should be at `await receiveSession`
    expect(readSession()).toBeUndefined();
    expect(user.getUser).not.toHaveBeenCalled();

    const req = new http.IncomingMessage(undefined as any);
    req.url = "?session=test";

    const res = new http.ServerResponse(req);
    vi.spyOn(res, "writeHead");
    vi.spyOn(res, "end");

    requestListener!(req, res);

    await serverClosed;
    expect(readSession()).toBeUndefined();
    expect(user.getUser).toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `https://${config.domains.services}/auth/cli?success=false` });
    expect(res.end).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });
});
