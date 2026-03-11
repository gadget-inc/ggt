import http from "node:http";

import getPort from "get-port";
import open from "open";
import { beforeEach, describe, expect, it, vi } from "vitest";

import login from "../../src/commands/login.js";
import { runCommand } from "../../src/services/command/run.js";
import { config } from "../../src/services/config/config.js";
import { readSession, writeSession } from "../../src/services/user/session.js";
import * as user from "../../src/services/user/user.js";
import { noop } from "../../src/services/util/function.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import { testCtx } from "../__support__/context.js";
import { mock } from "../__support__/mock.js";
import { expectStdout } from "../__support__/output.js";
import { testUser } from "../__support__/user.js";

describe("login", () => {
  let port: number;
  let server: http.Server;
  let serverListening: PromiseSignal;
  let serverClosed: PromiseSignal;
  let requestListener: http.RequestListener;
  let openedBrowser: PromiseSignal;

  beforeEach(async () => {
    port = await getPort();
    serverListening = new PromiseSignal();
    serverClosed = new PromiseSignal();
    server = { listen: vi.fn(serverListening.resolve), close: vi.fn(serverClosed.resolve) } as any;

    mock(http, "createServer", (opt, cb) => {
      requestListener = cb ?? (opt as http.RequestListener);
      return server;
    });

    openedBrowser = new PromiseSignal();
    mock(open, () => {
      openedBrowser.resolve();
      return undefined as never;
    });
  });

  it("opens a browser to the login page, waits for the user to login, set's the returned session, and redirects to /auth/cli?success=true", async () => {
    writeSession(testCtx, undefined);
    mock(user, "getUser", () => testUser);

    void runCommand(testCtx, login);
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
      "We've opened Gadget's login page using your default browser.

      Please log in and then return to this terminal.
      "
    `);

    // we should be at `await receiveSession`
    expect(readSession(testCtx)).toBeUndefined();
    expect(user.getUser).not.toHaveBeenCalled();

    const req = new http.IncomingMessage(undefined as any);
    req.url = "?session=test";

    const res = new http.ServerResponse(req);
    vi.spyOn(res, "writeHead");
    vi.spyOn(res, "end");

    requestListener!(req, res);

    await serverClosed;
    expect(readSession(testCtx)).toBe("test");
    expect(user.getUser).toHaveBeenCalled();
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

  it("prints the login page when open fails, waits for the user to login, set's the returned session, and redirects to /auth/cli?success=true", async () => {
    writeSession(testCtx, undefined);
    mock(user, "getUser", () => testUser);

    mock(open, () => {
      openedBrowser.resolve();
      throw new Error("boom");
    });

    void runCommand(testCtx, login);
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
      "Please open the following URL in your browser and log in:

        https://app.ggt.dev/auth/login?returnTo=https%3A%2F%2Fapp.ggt.dev%2Fauth%2Fcli%2Fcallback%3Fport%3D1234

      Once logged in, return to this terminal.
      "
    `);

    // we should be at `await receiveSession`
    expect(readSession(testCtx)).toBeUndefined();
    expect(user.getUser).not.toHaveBeenCalled();

    const req = new http.IncomingMessage(undefined as any);
    req.url = "?session=test";

    const res = new http.ServerResponse(req);
    vi.spyOn(res, "writeHead");
    vi.spyOn(res, "end");

    requestListener!(req, res);

    await serverClosed;
    expect(readSession(testCtx)).toBe("test");
    expect(user.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "Please open the following URL in your browser and log in:

        https://app.ggt.dev/auth/login?returnTo=https%3A%2F%2Fapp.ggt.dev%2Fauth%2Fcli%2Fcallback%3Fport%3D1234

      Once logged in, return to this terminal.

      Hello, Jane Doe (test@example.com)
      "
    `);
    expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `https://${config.domains.services}/auth/cli?success=true` });
    expect(res.end).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });

  it("ignores requests without a session param and keeps waiting for the real callback", async () => {
    writeSession(testCtx, undefined);
    mock(user, "getUser", () => testUser);

    void runCommand(testCtx, login);
    await serverListening;
    await openedBrowser;

    // simulate a spurious request (e.g. favicon, health check, port-forwarding probe)
    const spuriousReq = new http.IncomingMessage(undefined as any);
    spuriousReq.url = "/favicon.ico";

    const spuriousRes = new http.ServerResponse(spuriousReq);
    vi.spyOn(spuriousRes, "writeHead");
    vi.spyOn(spuriousRes, "end");

    requestListener!(spuriousReq, spuriousRes);

    // spurious request should get a 404, not crash the server
    expect(spuriousRes.writeHead).toHaveBeenCalledWith(404);
    expect(spuriousRes.end).toHaveBeenCalled();

    // the login flow should still be waiting — session not set, server not closed
    expect(readSession(testCtx)).toBeUndefined();
    expect(user.getUser).not.toHaveBeenCalled();
    expect(server.close).not.toHaveBeenCalled();

    // now send the real callback with a session
    const req = new http.IncomingMessage(undefined as any);
    req.url = "?session=test";

    const res = new http.ServerResponse(req);
    vi.spyOn(res, "writeHead");
    vi.spyOn(res, "end");

    requestListener!(req, res);

    await serverClosed;
    expect(readSession(testCtx)).toBe("test");
    expect(user.getUser).toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `https://${config.domains.services}/auth/cli?success=true` });
    expect(res.end).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });

  it("redirects to /auth/cli?success=false if an error occurs while setting the session", async () => {
    writeSession(testCtx, undefined);
    mock(user, "getUser", () => {
      throw new Error("boom");
    });

    void Promise.resolve(runCommand(testCtx, login)).catch(noop);
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
      "We've opened Gadget's login page using your default browser.

      Please log in and then return to this terminal.
      "
    `);

    // we should be at `await receiveSession`
    expect(readSession(testCtx)).toBeUndefined();
    expect(user.getUser).not.toHaveBeenCalled();

    const req = new http.IncomingMessage(undefined as any);
    req.url = "?session=test";

    const res = new http.ServerResponse(req);
    vi.spyOn(res, "writeHead");
    vi.spyOn(res, "end");

    requestListener!(req, res);

    await serverClosed;
    expect(readSession(testCtx)).toBeUndefined();
    expect(user.getUser).toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `https://${config.domains.services}/auth/cli?success=false` });
    expect(res.end).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });
});
