import debug from "debug";
import getPort from "get-port";
import http from "node:http";
import inquirer from "inquirer";
import _ from "lodash";
import open from "open";
import { BaseCommand } from "../../src/utils/base-command.js";
import { context } from "../../src/utils/context.js";
import { sleepUntil } from "../../src/utils/sleep.js";
import { ExitError } from "@oclif/errors";
import * as cliErrors from "@oclif/core/lib/parser/errors.js";
import { BaseError } from "../../src/utils/errors.js";
import { getError } from "../util.js";
import { describe, it, expect, vi, beforeEach } from "vitest";

class Base extends BaseCommand<typeof Base> {
  run = vi.fn() as any;
}

describe("BaseCommand", () => {
  let base: Base;

  beforeEach(() => {
    base = new Base([], context.config);
  });

  describe("init", () => {
    it.each(["--debug", "-D"])("enables debug when passed %s", async (flag) => {
      vi.spyOn(debug, "enable").mockImplementation(_.noop);

      base.argv = [flag];
      await base.init();

      expect(debug.enable).toHaveBeenCalledWith(`ggt:*`);
      expect(base.debugEnabled).toBe(true);
    });

    describe("with requireUser = true", () => {
      class DoesRequireUser extends BaseCommand<typeof DoesRequireUser> {
        override requireUser = true;
        run = vi.fn() as any;
      }

      beforeEach(() => {
        base = new DoesRequireUser([], context.config);
      });

      it("prompts the user to log in", async () => {
        inquirer.prompt.mockResolvedValue({ login: true });
        vi.spyOn(base, "login").mockResolvedValue();
        vi.spyOn(base, "exit").mockImplementation(_.noop);

        await base.init();

        expect(inquirer.prompt).toHaveBeenCalled();
        expect(base.login).toHaveBeenCalled();
        expect(base.exit).not.toHaveBeenCalled();
      });

      it("exits if the user declines to log in", async () => {
        inquirer.prompt.mockResolvedValue({ login: false });
        vi.spyOn(base, "login").mockResolvedValue();
        vi.spyOn(base, "exit").mockImplementation(_.noop);

        await base.init();

        expect(inquirer.prompt).toHaveBeenCalled();
        expect(base.login).not.toHaveBeenCalled();
        expect(base.exit).toHaveBeenCalledWith(0);
      });
    });

    describe("with requireUser = false", () => {
      it("does not prompt the user to log in", async () => {
        class DoesNotRequireUser extends BaseCommand<typeof DoesNotRequireUser> {
          override requireUser = false;
          run = vi.fn() as any;
        }

        await new DoesNotRequireUser([], context.config).init();

        expect(inquirer.prompt).not.toHaveBeenCalled();
      });
    });
  });

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
      vi.spyOn(res, "writeHead");
      vi.spyOn(res, "end");

      requestListener!(req, res);

      await sleepUntil(() => server.close.mock.calls.length > 0);
      expect(context.session).toBe("test");
      expect(context.getUser).toHaveBeenCalled();
      expect(base.log.mock.calls.at(-2)?.[0]).toMatchInlineSnapshot(`"Hello, Jane Doe (test@example.com)"`);
      expect(res.writeHead).toHaveBeenCalledWith(303, { Location: `https://${context.domains.services}/auth/cli?success=true` });
      expect(res.end).toHaveBeenCalled();
      expect(server.close).toHaveBeenCalled();
    });

    it("redirects to /auth/cli?success=false if an error occurs while setting the session", async () => {
      context.session = undefined;
      vi.spyOn(context, "getUser").mockRejectedValue(new Error("boom"));

      void base.login().catch(_.noop);

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

  describe("catch", () => {
    it.each([ExitError, ...Object.values(cliErrors)])("immediately rethrows CLIErrors", async (ctor) => {
      // value that all CLIError constructors will accept
      const arg = { flag: { helpLabel: "" }, flags: [], args: [], options: [], parse: {}, failed: [] } as any;
      const spy = vi.spyOn(BaseError.prototype, "capture");

      // @ts-expect-error ctor is a constructor
      const error = await getError(() => base.catch(new ctor(arg, arg)));

      expect(spy).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(ctor);
    });
  });
});
