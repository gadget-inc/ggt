import getPort from "get-port";
import http from "http";
import noop from "lodash/noop";
import nock from "nock";
import open from "open";
import { Api } from "../../src/lib/api";
import { Config } from "../../src/lib/config";
import { logger } from "../../src/lib/logger";
import { sleepUntil } from "../util";

describe("Api", () => {
  it("sets the cookie header if the Config's session is set", () => {
    Config.session = "test";
    expect(Api.headers["cookie"]).toBe("session=test;");
  });

  it("does not set the cookie header if the Config's session is not set", () => {
    Config.session = undefined;
    expect(Api.headers["cookie"]).toBeUndefined();
  });

  describe("getCurrentUser", () => {
    it("returns the user if the Config's session is set", async () => {
      const user = { email: "test@example.com", name: "Jane Doe" };
      nock(Api.ENDPOINT).get("/auth/api/current-user").reply(200, user);
      Config.session = "test";

      await expect(Api.getCurrentUser()).resolves.toEqual(user);
      expect(nock.isDone()).toBe(true);
    });

    it("returns undefined if the Config's session is not set", async () => {
      Config.session = undefined;
      await expect(Api.getCurrentUser()).resolves.toBeUndefined();
    });

    it("returns undefined if the Config's session is invalid or expired", async () => {
      Config.session = "test";
      nock(Api.ENDPOINT).get("/auth/api/current-user").reply(401);

      await expect(Api.getCurrentUser()).resolves.toBeUndefined();
      expect(nock.isDone()).toBe(true);
      expect(Config.session).toBeUndefined();
      expect(Config.save).toHaveBeenCalled();
    });
  });

  describe("login", () => {
    let port: number;
    let server: http.Server;
    let requestListener: http.RequestListener;

    beforeEach(async () => {
      port = await getPort();
      server = { listen: jest.fn(), close: jest.fn() } as any;
      jest.spyOn(http, "createServer").mockImplementation((opt, cb) => {
        requestListener = cb ?? (opt as http.RequestListener);
        return server;
      });
    });

    it("opens a browser to the login page, waits for the user to login, saves the returned session, and redirects to /auth/cli?success=true", async () => {
      Config.session = undefined;
      jest.spyOn(Api, "getCurrentUser").mockResolvedValue({ email: "test@example.com", name: "Jane Doe" });

      void Api.login();

      await sleepUntil(() => http.createServer.mock.calls.length > 0);
      expect(getPort).toHaveBeenCalled();
      expect(requestListener!).toBeDefined();
      expect(server.listen).toHaveBeenCalledWith(port);
      expect(open).toHaveBeenCalledWith(
        `${Api.ENDPOINT}/auth/login?returnTo=${encodeURIComponent(`${Api.ENDPOINT}/auth/cli/callback?port=${port}`)}`
      );
      expect(logger.info).toHaveBeenCalledWith("Your browser has been opened. Please log in to your account.");

      // we should be at `await receiveSession`
      expect(Config.session).toBeUndefined();
      expect(Api.getCurrentUser).not.toHaveBeenCalled();

      const req = new http.IncomingMessage(null as any);
      req.url = `?session=test`;

      const res = new http.ServerResponse(req);
      jest.spyOn(res, "writeHead");
      jest.spyOn(res, "end");

      requestListener!(req, res);

      await sleepUntil(() => server.close.mock.calls.length > 0);
      expect(Config.session).toBe("test");
      expect(Api.getCurrentUser).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("👋 Hello, Jane Doe (test@example.com)");
      expect(Config.save).toHaveBeenCalled();
      expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `${Api.ENDPOINT}/auth/cli?success=true` });
      expect(res.end).toHaveBeenCalled();
      expect(server.close).toHaveBeenCalled();
    });

    it("redirects to /auth/cli?success=false if an error occurs while saving the session", async () => {
      Config.session = undefined;
      jest.spyOn(Api, "getCurrentUser").mockRejectedValue(new Error("boom"));

      void Api.login().catch(noop);

      await sleepUntil(() => http.createServer.mock.calls.length > 0);
      expect(getPort).toHaveBeenCalled();
      expect(requestListener!).toBeDefined();
      expect(server.listen).toHaveBeenCalledWith(port);
      expect(open).toHaveBeenCalledWith(
        `${Api.ENDPOINT}/auth/login?returnTo=${encodeURIComponent(`${Api.ENDPOINT}/auth/cli/callback?port=${port}`)}`
      );
      expect(logger.info).toHaveBeenCalledWith("Your browser has been opened. Please log in to your account.");

      // we should be at `await receiveSession`
      expect(Config.session).toBeUndefined();
      expect(Api.getCurrentUser).not.toHaveBeenCalled();

      const req = new http.IncomingMessage(null as any);
      req.url = `?session=test`;

      const res = new http.ServerResponse(req);
      jest.spyOn(res, "writeHead");
      jest.spyOn(res, "end");

      requestListener!(req, res);

      await sleepUntil(() => server.close.mock.calls.length > 0);
      expect(Config.session).toBe("test");
      expect(Api.getCurrentUser).toHaveBeenCalled();
      expect(Config.save).not.toHaveBeenCalled();
      expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `${Api.ENDPOINT}/auth/cli?success=false` });
      expect(res.end).toHaveBeenCalled();
      expect(server.close).toHaveBeenCalled();
    });
  });
});
