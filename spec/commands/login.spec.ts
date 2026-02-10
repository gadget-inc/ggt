import getPort from "get-port";
import http from "node:http";
import open from "open";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as login from "../../src/commands/login.js";
import { config } from "../../src/services/config/config.js";
import { readSession, writeSession } from "../../src/services/user/session.js";
import * as user from "../../src/services/user/user.js";
import { noop } from "../../src/services/util/function.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import { makeRootArgs } from "../__support__/arg.js";
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

    void login.run(testCtx, makeRootArgs());
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

    void login.run(testCtx, makeRootArgs());
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

  it("redirects to /auth/cli?success=false if an error occurs while setting the session", async () => {
    writeSession(testCtx, undefined);
    mock(user, "getUser", () => {
      throw new Error("boom");
    });

    void Promise.resolve(login.run(testCtx, makeRootArgs())).catch(noop);
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
