import nock from "nock";
import { expect } from "vitest";
import type { App } from "../../src/services/app/app.js";
import { config } from "../../src/services/config/config.js";
import { loadCookie } from "../../src/services/util/http.js";
import { testUser } from "./user.js";

export const testApp: App = {
  id: 1,
  slug: "test",
  primaryDomain: "test.gadget.app",
  hasSplitEnvironments: true,
  user: testUser,
};

export const notTestApp: App = {
  id: 2,
  slug: "not-test",
  primaryDomain: "not-test.gadget.app",
  hasSplitEnvironments: false,
  user: testUser,
};

export const nockTestApps = ({ optional = true } = {}): void => {
  nock(`https://${config.domains.services}`)
    .get("/auth/api/apps")
    .optionally(optional)
    .matchHeader("cookie", (value) => {
      const cookie = loadCookie();
      expect(cookie).toBeTruthy();
      return value === cookie;
    })
    .reply(200, [testApp, notTestApp])
    .persist();
};
