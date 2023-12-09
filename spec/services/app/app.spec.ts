import nock from "nock";
import { describe, expect, it } from "vitest";
import { getApps } from "../../../src/services/app/app.js";
import { config } from "../../../src/services/config/config.js";
import { loadCookie } from "../../../src/services/http/auth.js";
import { writeSession } from "../../../src/services/user/session.js";
import { testApp } from "../../__support__/app.js";
import { testUser } from "../../__support__/user.js";

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
  });
});
