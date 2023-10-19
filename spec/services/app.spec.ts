import nock from "nock";
import { describe, expect, it } from "vitest";
import { getApps } from "../../src/services/app.js";
import { config } from "../../src/services/config.js";
import { loadCookie } from "../../src/services/http.js";
import { writeSession } from "../../src/services/session.js";
import { testApp, testUser } from "../util.js";

describe("app", () => {
  describe("getApps", () => {
    it("returns the available apps if the session is set", async () => {
      const apps = [testApp];
      writeSession("test");
      nock(`https://${config.domains.services}`).get("/auth/api/apps").matchHeader("cookie", loadCookie()!).reply(200, apps);

      await expect(getApps(testUser)).resolves.toEqual(apps);
      expect(nock.isDone()).toBe(true);
    });

    it("returns an empty array if the session is not set", async () => {
      writeSession(undefined);
      await expect(getApps(testUser)).resolves.toEqual([]);
    });

    it.skip("caches the available apps", async () => {
      const apps = [testApp];
      nock(`https://${config.domains.services}`).get("/auth/api/apps").reply(200, apps);
      writeSession("test");

      await expect(getApps(testUser)).resolves.toEqual(apps);

      for (let i = 0; i < 10; i++) {
        expect(nock.isDone()).toBe(true);
        await expect(getApps(testUser)).resolves.toEqual(apps);
      }
    });
  });
});
