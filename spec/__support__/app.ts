import nock from "nock";
import { expect } from "vitest";
import { EnvironmentType, type App } from "../../src/services/app/app.js";
import { config } from "../../src/services/config/config.js";
import { loadCookie } from "../../src/services/http/auth.js";

/**
 * A Gadget app to use in tests.
 */
export const testApp: App = Object.freeze({
  id: 1n,
  slug: "test",
  primaryDomain: "test.gadget.app",
  hasSplitEnvironments: true,
  multiEnvironmentEnabled: true,
  environments: [
    {
      id: 1n,
      name: "development",
      type: EnvironmentType.Development,
    },
    {
      id: 2n,
      name: "production",
      type: EnvironmentType.Production,
    },
    {
      id: 3n,
      name: "cool-environment-development",
      type: EnvironmentType.Development,
    },
    {
      id: 4n,
      name: "other-environment-development",
      type: EnvironmentType.Development,
    },
  ],
});

/**
 * A Gadget app to use in tests with a different ID and slug.
 */
export const testApp2: App = Object.freeze({
  ...testApp,
  id: 2n,
  slug: "test2",
  primaryDomain: "test2.gadget.app",
});

/**
 * A Gadget app to use when testing apps with only 2 environments.
 */
export const testAppWith2Environments: App = Object.freeze({
  id: 2n,
  slug: "test-with-2-environments",
  primaryDomain: "test-with-2-environments.gadget.app",
  hasSplitEnvironments: true,
  multiEnvironmentEnabled: false,
  environments: [
    {
      id: 1n,
      name: "development",
      type: EnvironmentType.Development,
    },
    {
      id: 2n,
      name: "production",
      type: EnvironmentType.Production,
    },
  ],
});

/**
 * A Gadget app to use when testing apps without environments.
 */
export const testAppWith0Environments: App = Object.freeze({
  id: 3n,
  slug: "test-with-0-environments",
  primaryDomain: "test-with-0-environments.gadget.app",
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
    .reply(200, [testApp, testApp2, testAppWith2Environments, testAppWith0Environments])
    .persist(persist);
};
