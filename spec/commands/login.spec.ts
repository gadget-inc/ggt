import getPort from "get-port";
import http from "node:http";
import open from "open";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../../src/commands/login.js";
import { config } from "../../src/services/config.js";
import { readSession, writeSession } from "../../src/services/session.js";
import { sleepUntil } from "../../src/services/sleep.js";
import * as user from "../../src/services/user.js";
import { expectStdout, testUser } from "../util.js";

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
    open.mockReset();
  });

  it("opens a browser to the login page, waits for the user to login, set's the returned session, and redirects to /auth/cli?success=true", async () => {
    writeSession(undefined);
    vi.spyOn(user, "getUser").mockResolvedValue(testUser);

    void run();

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
    expect(readSession()).toBeUndefined();
    expect(user.getUser).not.toHaveBeenCalled();

    const req = new http.IncomingMessage(null as any);
    req.url = `?session=test`;

    const res = new http.ServerResponse(req);
    vi.spyOn(res, "writeHead");
    vi.spyOn(res, "end");

    requestListener!(req, res);

    await sleepUntil(() => server.close.mock.calls.length > 0);
    expect(readSession()).toBe("test");
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
    writeSession(undefined);
    vi.spyOn(user, "getUser").mockResolvedValue(testUser);
    open.mockRejectedValue(new Error("boom"));

    void run();

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
      "Please open the following URL in your browser and log in:

        https://app.ggt.dev/auth/login?returnTo=https%3A%2F%2Fapp.ggt.dev%2Fauth%2Fcli%2Fcallback%3Fport%3D1234

      Once logged in, return to this terminal.

      "
    `);

    // we should be at `await receiveSession`
    expect(readSession()).toBeUndefined();
    expect(user.getUser).not.toHaveBeenCalled();

    const req = new http.IncomingMessage(null as any);
    req.url = `?session=test`;

    const res = new http.ServerResponse(req);
    vi.spyOn(res, "writeHead");
    vi.spyOn(res, "end");

    requestListener!(req, res);

    await sleepUntil(() => server.close.mock.calls.length > 0);
    expect(readSession()).toBe("test");
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
    writeSession(undefined);
    vi.spyOn(user, "getUser").mockRejectedValue(new Error("boom"));

    void run().catch(noop);

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
    expect(readSession()).toBeUndefined();
    expect(user.getUser).not.toHaveBeenCalled();

    const req = new http.IncomingMessage(null as any);
    req.url = `?session=test`;

    const res = new http.ServerResponse(req);
    vi.spyOn(res, "writeHead");
    vi.spyOn(res, "end");

    requestListener!(req, res);

    await sleepUntil(() => server.close.mock.calls.length > 0);
    expect(readSession()).toBeUndefined();
    expect(user.getUser).toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `https://${config.domains.services}/auth/cli?success=false` });
    expect(res.end).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });
});
