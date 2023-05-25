import path from "path";
import fs from "fs-extra";
import { Context, context } from "../../src/utils/context.js";
import nock from "nock";
import { describe, it, expect, vi, afterEach } from "vitest";

describe("Context", () => {
  describe("session", () => {
    describe("get", () => {
      it("loads session.txt from the filesystem", () => {
        context.session = undefined;

        fs.outputFileSync(path.join(context.config.configDir, "session.txt"), expect.getState().currentTestName!);

        expect(context.session).toBe(expect.getState().currentTestName);
      });

      it("caches the session in memory", () => {
        fs.outputFileSync(path.join(context.config.configDir, "session.txt"), expect.getState().currentTestName!);
        vi.spyOn(fs, "readFileSync");

        for (let i = 0; i < 10; i++) {
          expect(context.session).toBe(expect.getState().currentTestName);
        }

        expect(fs.readFileSync).toHaveBeenCalledTimes(1);
      });

      it("does not throw ENOENT if the file does not exist", () => {
        expect(fs.existsSync(path.join(context.config.configDir, "session.txt"))).toBe(false);

        expect(context.session).toBeUndefined();
      });
    });

    describe("set", () => {
      it("saves session.txt to the filesystem", () => {
        expect(fs.existsSync(path.join(context.config.configDir, "session.txt"))).toBe(false);

        context.session = expect.getState().currentTestName;

        expect(fs.readFileSync(path.join(context.config.configDir, "session.txt"), "utf-8")).toEqual(expect.getState().currentTestName);
      });

      it("removes session.txt from the filesystem", () => {
        fs.outputFileSync(path.join(context.config.configDir, "session.txt"), expect.getState().currentTestName!);
        expect(fs.existsSync(path.join(context.config.configDir, "session.txt"))).toBe(true);

        context.session = undefined;

        expect(fs.existsSync(path.join(context.config.configDir, "session.txt"))).toBe(false);
      });
    });
  });

  describe("getUser", () => {
    it("returns the user if the session is set", async () => {
      const user = { email: "test@example.com", name: "Jane Doe" };
      nock(`https://${context.domains.services}`).get("/auth/api/current-user").reply(200, user);
      context.session = "test";

      await expect(context.getUser()).resolves.toEqual(user);
      expect(nock.isDone()).toBe(true);
    });

    it("returns undefined if the session is not set", async () => {
      context.session = undefined;
      await expect(context.getUser()).resolves.toBeUndefined();
    });

    it("returns undefined if the session is invalid or expired", async () => {
      context.session = "test";
      nock(`https://${context.domains.services}`).get("/auth/api/current-user").reply(401);

      await expect(context.getUser()).resolves.toBeUndefined();
      expect(nock.isDone()).toBe(true);
      expect(context.session).toBeUndefined();
    });

    it("caches the user", async () => {
      const user = { email: "test@example.com", name: "Jane Doe" };
      nock(`https://${context.domains.services}`).get("/auth/api/current-user").reply(200, user);
      context.session = "test";

      await expect(context.getUser()).resolves.toEqual(user);

      for (let i = 0; i < 10; i++) {
        expect(nock.isDone()).toBe(true);
        await expect(context.getUser()).resolves.toEqual(user);
      }
    });
  });

  describe("getAvailableApps", () => {
    it("returns the available apps if the session is set", async () => {
      const apps = [{ id: 1, name: "Test App" }];
      nock(`https://${context.domains.services}`).get("/auth/api/apps").reply(200, apps);

      context.session = "test";

      await expect(context.getAvailableApps()).resolves.toEqual(apps);
      expect(nock.isDone()).toBe(true);
    });

    it("returns an empty array if the session is not set", async () => {
      context.session = undefined;
      await expect(context.getAvailableApps()).resolves.toEqual([]);
    });

    it("caches the available apps", async () => {
      const apps = [{ id: 1, name: "Test App" }];
      nock(`https://${context.domains.services}`).get("/auth/api/apps").reply(200, apps);
      context.session = "test";

      await expect(context.getAvailableApps()).resolves.toEqual(apps);

      for (let i = 0; i < 10; i++) {
        expect(nock.isDone()).toBe(true);
        await expect(context.getAvailableApps()).resolves.toEqual(apps);
      }
    });
  });

  describe("domains", () => {
    afterEach(() => {
      delete process.env["GGT_GADGET_APP_DOMAIN"];
      delete process.env["GGT_GADGET_SERVICES_DOMAIN"];
    });

    describe("app", () => {
      it("uses GGT_GADGET_APP_DOMAIN if set", () => {
        const domain = "test.example.com";
        process.env["GGT_GADGET_APP_DOMAIN"] = domain;
        expect(new Context().domains.app).toBe(domain);
      });

      it("defaults to gadget.app when GGT_ENV is production", () => {
        process.env["GGT_ENV"] = "production";
        expect(new Context().domains.app).toBe("gadget.app");
      });

      it("defaults to ggt.pub otherwise", () => {
        expect(new Context().domains.app).toBe("ggt.pub");
      });
    });

    describe("services", () => {
      it("uses GGT_GADGET_SERVICES_DOMAIN if set", () => {
        const domain = "test.example.com";
        process.env["GGT_GADGET_SERVICES_DOMAIN"] = domain;
        expect(new Context().domains.services).toBe(domain);
      });

      it("defaults to app.gadget.dev when GGT_ENV is production", () => {
        process.env["GGT_ENV"] = "production";
        expect(new Context().domains.services).toBe("app.gadget.dev");
      });

      it("defaults to app.ggt.dev otherwise", () => {
        expect(new Context().domains.services).toBe("app.ggt.dev");
      });
    });
  });
});
