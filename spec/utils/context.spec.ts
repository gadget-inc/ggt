import path from "path";
import fs from "fs-extra";
import { context } from "../../src/utils/context";
import nock from "nock";

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
        jest.spyOn(fs, "readFileSync");

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
      expect(nock.isDone()).toBeTrue();
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
        expect(nock.isDone()).toBeTrue();
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
      expect(nock.isDone()).toBeTrue();
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
        expect(nock.isDone()).toBeTrue();
        await expect(context.getAvailableApps()).resolves.toEqual(apps);
      }
    });
  });
});
