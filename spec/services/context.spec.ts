import fs from "fs-extra";
import nock from "nock";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../../src/services/config.js";
import { Context } from "../../src/services/context.js";

describe("Context", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = new Context();
  });

  describe("session", () => {
    describe("get", () => {
      it("loads session.txt from the filesystem", () => {
        ctx.session = undefined;

        fs.outputFileSync(path.join(config.configDir, "session.txt"), expect.getState().currentTestName!);

        expect(ctx.session).toBe(expect.getState().currentTestName);
      });

      it("caches the session in memory", () => {
        fs.outputFileSync(path.join(config.configDir, "session.txt"), expect.getState().currentTestName!);
        vi.spyOn(fs, "readFileSync");

        for (let i = 0; i < 10; i++) {
          expect(ctx.session).toBe(expect.getState().currentTestName);
        }

        expect(fs.readFileSync).toHaveBeenCalledTimes(1);
      });

      it("does not throw ENOENT if the file does not exist", () => {
        expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(false);

        expect(ctx.session).toBeUndefined();
      });
    });

    describe("set", () => {
      it("saves session.txt to the filesystem", () => {
        expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(false);

        ctx.session = expect.getState().currentTestName;

        expect(fs.readFileSync(path.join(config.configDir, "session.txt"), "utf-8")).toEqual(expect.getState().currentTestName);
      });

      it("removes session.txt from the filesystem", () => {
        fs.outputFileSync(path.join(config.configDir, "session.txt"), expect.getState().currentTestName!);
        expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(true);

        ctx.session = undefined;

        expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(false);
      });
    });
  });

  describe("getUser", () => {
    it("returns the user if the session is set", async () => {
      const user = { email: "test@example.com", name: "Jane Doe" };
      nock(`https://${config.domains.services}`).get("/auth/api/current-user").reply(200, user);
      ctx.session = "test";

      await expect(ctx.getUser()).resolves.toEqual(user);
      expect(nock.isDone()).toBe(true);
    });

    it("returns undefined if the session is not set", async () => {
      ctx.session = undefined;
      await expect(ctx.getUser()).resolves.toBeUndefined();
    });

    it("returns undefined if the session is invalid or expired", async () => {
      ctx.session = "test";
      nock(`https://${config.domains.services}`).get("/auth/api/current-user").reply(401);

      await expect(ctx.getUser()).resolves.toBeUndefined();
      expect(nock.isDone()).toBe(true);
      expect(ctx.session).toBeUndefined();
    });

    it("caches the user", async () => {
      const user = { email: "test@example.com", name: "Jane Doe" };
      nock(`https://${config.domains.services}`).get("/auth/api/current-user").reply(200, user);
      ctx.session = "test";

      await expect(ctx.getUser()).resolves.toEqual(user);

      for (let i = 0; i < 10; i++) {
        expect(nock.isDone()).toBe(true);
        await expect(ctx.getUser()).resolves.toEqual(user);
      }
    });
  });

  describe("getAvailableApps", () => {
    it("returns the available apps if the session is set", async () => {
      const apps = [{ id: 1, name: "Test App" }];
      nock(`https://${config.domains.services}`).get("/auth/api/apps").reply(200, apps);

      ctx.session = "test";

      await expect(ctx.getAvailableApps()).resolves.toEqual(apps);
      expect(nock.isDone()).toBe(true);
    });

    it("returns an empty array if the session is not set", async () => {
      ctx.session = undefined;
      await expect(ctx.getAvailableApps()).resolves.toEqual([]);
    });

    it("caches the available apps", async () => {
      const apps = [{ id: 1, name: "Test App" }];
      nock(`https://${config.domains.services}`).get("/auth/api/apps").reply(200, apps);
      ctx.session = "test";

      await expect(ctx.getAvailableApps()).resolves.toEqual(apps);

      for (let i = 0; i < 10; i++) {
        expect(nock.isDone()).toBe(true);
        await expect(ctx.getAvailableApps()).resolves.toEqual(apps);
      }
    });
  });
});
