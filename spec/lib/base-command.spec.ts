import { Config as OclifConfig } from "@oclif/core";
import getPort from "get-port";
import http from "http";
import { prompt } from "inquirer";
import { noop } from "lodash";
import nock from "nock";
import open from "open";
import { BaseCommand, ENDPOINT } from "../../src/lib/base-command";
import { Config } from "../../src/lib/config";
import { logger } from "../../src/lib/logger";
import { sleepUntil } from "../../src/lib/sleep";

class Base extends BaseCommand {
  run = jest.fn();
}

describe("BaseCommand", () => {
  let oclifConfig: OclifConfig;
  let base: Base;

  beforeEach(async () => {
    oclifConfig = (await OclifConfig.load()) as OclifConfig;
    base = new Base([], oclifConfig);
  });

  describe("init", () => {
    it("configures the logger's stdout log level", async () => {
      base.argv = ["--log-level", "error"];

      await base.init();

      expect(logger.configure).toHaveBeenCalledWith({ stdout: "error" });
    });

    describe("with requireUser = true", () => {
      class DoesRequireUser extends BaseCommand {
        override requireUser = true;
        run = jest.fn();
      }

      beforeEach(() => {
        base = new DoesRequireUser([], oclifConfig);
      });

      it("prompts the user to log in if the command requires a user", async () => {
        prompt.mockResolvedValue({ login: true });
        jest.spyOn(base, "login").mockResolvedValue();
        jest.spyOn(base, "exit").mockImplementation();

        await base.init();

        expect(prompt).toHaveBeenCalled();
        expect(base.login).toHaveBeenCalled();
        expect(base.exit).not.toHaveBeenCalled();
      });

      it("exits if the user declines to log in", async () => {
        prompt.mockResolvedValue({ login: false });
        jest.spyOn(base, "login").mockResolvedValue();
        jest.spyOn(base, "exit").mockImplementation();

        await base.init();

        expect(prompt).toHaveBeenCalled();
        expect(base.login).not.toHaveBeenCalled();
        expect(base.exit).toHaveBeenCalledWith(0);
      });
    });

    describe("with requireUser = false", () => {
      it("does not prompt the user to log in if the command does not require a user", async () => {
        class DoesNotRequireUser extends BaseCommand {
          override requireUser = false;
          run = jest.fn();
        }

        await new DoesNotRequireUser([], oclifConfig).init();

        expect(prompt).not.toHaveBeenCalled();
      });
    });
  });

  describe("getCurrentUser", () => {
    it("returns the user if the Config's session is set", async () => {
      const user = { email: "test@example.com", name: "Jane Doe" };
      nock(ENDPOINT).get("/auth/api/current-user").reply(200, user);
      Config.session = "test";

      await expect(base.getCurrentUser()).resolves.toEqual(user);
      expect(nock.isDone()).toBeTrue();
    });

    it("returns undefined if the Config's session is not set", async () => {
      Config.session = undefined;
      await expect(base.getCurrentUser()).resolves.toBeUndefined();
    });

    it("returns undefined if the Config's session is invalid or expired", async () => {
      Config.session = "test";
      nock(ENDPOINT).get("/auth/api/current-user").reply(401);

      await expect(base.getCurrentUser()).resolves.toBeUndefined();
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
      jest.spyOn(base, "getCurrentUser").mockResolvedValue({ email: "test@example.com", name: "Jane Doe" });

      void base.login();

      await sleepUntil(() => http.createServer.mock.calls.length > 0);
      expect(getPort).toHaveBeenCalled();
      expect(requestListener!).toBeDefined();
      expect(server.listen).toHaveBeenCalledWith(port);
      expect(open).toHaveBeenCalledWith(
        `${ENDPOINT}/auth/login?returnTo=${encodeURIComponent(`${ENDPOINT}/auth/cli/callback?port=${port}`)}`
      );
      expect(logger.info).toHaveBeenCalledWith("Your browser has been opened. Please log in to your account.");

      // we should be at `await receiveSession`
      expect(Config.session).toBeUndefined();
      expect(base.getCurrentUser).not.toHaveBeenCalled();

      const req = new http.IncomingMessage(null as any);
      req.url = `?session=test`;

      const res = new http.ServerResponse(req);
      jest.spyOn(res, "writeHead");
      jest.spyOn(res, "end");

      requestListener!(req, res);

      await sleepUntil(() => server.close.mock.calls.length > 0);
      expect(Config.session).toBe("test");
      expect(base.getCurrentUser).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("👋 Hello, Jane Doe (test@example.com)");
      expect(Config.save).toHaveBeenCalled();
      expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `${ENDPOINT}/auth/cli?success=true` });
      expect(res.end).toHaveBeenCalled();
      expect(server.close).toHaveBeenCalled();
    });

    it("redirects to /auth/cli?success=false if an error occurs while saving the session", async () => {
      Config.session = undefined;
      jest.spyOn(base, "getCurrentUser").mockRejectedValue(new Error("boom"));

      void base.login().catch(noop);

      await sleepUntil(() => http.createServer.mock.calls.length > 0);
      expect(getPort).toHaveBeenCalled();
      expect(requestListener!).toBeDefined();
      expect(server.listen).toHaveBeenCalledWith(port);
      expect(open).toHaveBeenCalledWith(
        `${ENDPOINT}/auth/login?returnTo=${encodeURIComponent(`${ENDPOINT}/auth/cli/callback?port=${port}`)}`
      );
      expect(logger.info).toHaveBeenCalledWith("Your browser has been opened. Please log in to your account.");

      // we should be at `await receiveSession`
      expect(Config.session).toBeUndefined();
      expect(base.getCurrentUser).not.toHaveBeenCalled();

      const req = new http.IncomingMessage(null as any);
      req.url = `?session=test`;

      const res = new http.ServerResponse(req);
      jest.spyOn(res, "writeHead");
      jest.spyOn(res, "end");

      requestListener!(req, res);

      await sleepUntil(() => server.close.mock.calls.length > 0);
      expect(Config.session).toBe("test");
      expect(base.getCurrentUser).toHaveBeenCalled();
      expect(Config.save).not.toHaveBeenCalled();
      expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `${ENDPOINT}/auth/cli?success=false` });
      expect(res.end).toHaveBeenCalled();
      expect(server.close).toHaveBeenCalled();
    });
  });
});
