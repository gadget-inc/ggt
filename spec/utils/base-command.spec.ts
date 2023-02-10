import debug from "debug";
import getPort from "get-port";
import http from "http";
import { prompt } from "inquirer";
import { noop } from "lodash";
import open from "open";
import { BaseCommand } from "../../src/utils/base-command";
import { context } from "../../src/utils/context";
import { sleepUntil } from "../../src/utils/sleep";

class Base extends BaseCommand<typeof Base> {
  run = jest.fn();
}

describe("BaseCommand", () => {
  let base: Base;

  beforeEach(() => {
    base = new Base([], context.config);
  });

  describe("init", () => {
    it.each(["--debug", "-D"])("enables debug when passed %s", async (flag) => {
      jest.spyOn(debug, "enable").mockImplementation();

      base.argv = [flag];
      await base.init();

      expect(debug.enable).toHaveBeenCalledWith(`ggt:*`);
      expect(base.debugEnabled).toBeTrue();
    });

    describe("with requireUser = true", () => {
      class DoesRequireUser extends BaseCommand<typeof DoesRequireUser> {
        override requireUser = true;
        run = jest.fn();
      }

      beforeEach(() => {
        base = new DoesRequireUser([], context.config);
      });

      it("prompts the user to log in", async () => {
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
      it("does not prompt the user to log in", async () => {
        class DoesNotRequireUser extends BaseCommand<typeof DoesNotRequireUser> {
          override requireUser = false;
          run = jest.fn();
        }

        await new DoesNotRequireUser([], context.config).init();

        expect(prompt).not.toHaveBeenCalled();
      });
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

    it("opens a browser to the login page, waits for the user to login, set's the returned session, and redirects to /auth/cli?success=true", async () => {
      context.session = undefined;
      jest.spyOn(context, "getUser").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });

      void base.login();

      await sleepUntil(() => http.createServer.mock.calls.length > 0);
      expect(getPort).toHaveBeenCalled();
      expect(requestListener!).toBeDefined();
      expect(server.listen).toHaveBeenCalledWith(port);
      expect(open).toHaveBeenCalledWith(
        `https://${context.domains.services}/auth/login?returnTo=${encodeURIComponent(
          `https://${context.domains.services}/auth/cli/callback?port=${port}`
        )}`
      );
      expect(base.log.mock.lastCall?.[0]).toMatchInlineSnapshot(`
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
      jest.spyOn(res, "writeHead");
      jest.spyOn(res, "end");

      requestListener!(req, res);

      await sleepUntil(() => server.close.mock.calls.length > 0);
      expect(context.session).toBe("test");
      expect(context.getUser).toHaveBeenCalled();
      expect(base.log.mock.lastCall?.[0]).toMatchInlineSnapshot(`"Hello, Jane Doe (test@example.com)"`);
      expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `https://${context.domains.services}/auth/cli?success=true` });
      expect(res.end).toHaveBeenCalled();
      expect(server.close).toHaveBeenCalled();
    });

    it("redirects to /auth/cli?success=false if an error occurs while setting the session", async () => {
      context.session = undefined;
      jest.spyOn(context, "getUser").mockRejectedValue(new Error("boom"));

      void base.login().catch(noop);

      await sleepUntil(() => http.createServer.mock.calls.length > 0);
      expect(getPort).toHaveBeenCalled();
      expect(requestListener!).toBeDefined();
      expect(server.listen).toHaveBeenCalledWith(port);
      expect(open).toHaveBeenCalledWith(
        `https://${context.domains.services}/auth/login?returnTo=${encodeURIComponent(
          `https://${context.domains.services}/auth/cli/callback?port=${port}`
        )}`
      );
      expect(base.log.mock.lastCall?.[0]).toMatchInlineSnapshot(`
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
      jest.spyOn(res, "writeHead");
      jest.spyOn(res, "end");

      requestListener!(req, res);

      await sleepUntil(() => server.close.mock.calls.length > 0);
      expect(context.session).toBeUndefined();
      expect(context.getUser).toHaveBeenCalled();
      expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `https://${context.domains.services}/auth/cli?success=false` });
      expect(res.end).toHaveBeenCalled();
      expect(server.close).toHaveBeenCalled();
    });
  });
});
