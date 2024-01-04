import nock from "nock";
import { expect } from "vitest";
import type { App } from "../../src/services/app/app.js";
import { config } from "../../src/services/config/config.js";
import { loadCookie } from "../../src/services/http/auth.js";

/**
 * A test Gadget app to use in tests with multi environment on.
 */
export const multiEnvironmentTestApp: App = Object.freeze({
  id: 1,
  slug: "test-multi-environment",
  primaryDomain: "test.gadget.app",
  hasSplitEnvironments: true,
  multiEnvironmentEnabled: true,
  environments: [
    {
      id: 1,
      name: "development",
      type: "development",
    },
    {
      id: 2,
      name: "production",
      type: "production",
    },
    {
      id: 3,
      name: "cool-environment-development",
      type: "development",
    },
    {
      id: 4,
      name: "other-environment-development",
      type: "development",
    },
  ],
});

/**
 * A test Gadget app to use in tests.
 */
export const testApp: App = Object.freeze({
  id: 1,
  slug: "test",
  primaryDomain: "test.gadget.app",
  hasSplitEnvironments: true,
  multiEnvironmentEnabled: false,
  environments: [
    {
      id: 1,
      name: "development",
      type: "development",
    },
    {
      id: 2,
      name: "production",
      type: "production",
    },
  ],
});

/**
 * Another test Gadget app to use in tests.
 *
 * This app does not have split environments.
 */
export const notTestApp: App = Object.freeze({
  id: 2,
  slug: "not-test",
  primaryDomain: "not-test.gadget.app",
  hasSplitEnvironments: false,
  multiEnvironmentEnabled: false,
  environments: [],
});

/**
 * Sets up a response for the apps endpoint that `getApps` uses.
 */
export const nockTestApps = ({ optional = true, persist = true } = {}): void => {
  nock(`https://${config.domains.services}`)
    .get("/auth/api/apps")
    .optionally(optional)
    .matchHeader("cookie", (value) => {
      const cookie = loadCookie();
      expect(cookie).toBeTruthy();
      return value === cookie;
    })
    .reply(200, [testApp, notTestApp, multiEnvironmentTestApp])
    .persist(persist);
};
