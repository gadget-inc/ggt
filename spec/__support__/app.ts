import nock from "nock";
import { expect } from "vitest";
import { EnvironmentType, type Application, type Environment } from "../../src/services/app/app.js";
import { config } from "../../src/services/config/config.js";
import { loadCookie } from "../../src/services/http/auth.js";
import { testCtx } from "./context.js";

/**
 * A Gadget app to use in tests.
 */
export const testApp: Application = Object.freeze({
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
  team: {
    id: 1n,
    name: "first-test-team",
  },
});

/**
 * The first environment of the {@linkcode testApp}.
 */
export const testEnvironment: Environment = {
  ...testApp.environments[0]!,
  application: testApp,
};

/**
 * A Gadget app to use in tests with a different ID and slug.
 */
export const testApp2: Application = Object.freeze({
  ...testApp,
  id: 2n,
  slug: "test2",
  primaryDomain: "test2.gadget.app",
});

/**
 * A Gadget app to use when testing apps with only 2 environments.
 */
export const testAppWith2Environments: Application = Object.freeze({
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
  team: {
    id: 2n,
    name: "second-test-team",
  },
});

/**
 * A Gadget app to use when testing apps without environments.
 */
export const testAppWith0Environments: Application = Object.freeze({
  id: 3n,
  slug: "test-with-0-environments",
  primaryDomain: "test-with-0-environments.gadget.app",
  hasSplitEnvironments: false,
  multiEnvironmentEnabled: false,
  environments: [],
  team: {
    id: 1n,
    name: "first-test-team",
  },
});

/**
 * Sets up a response for the apps endpoint that `getApps` uses.
 */
export const nockTestApps = ({ optional = true, persist = true } = {}): void => {
  nock(`https://${config.domains.services}`)
    .get("/auth/api/apps")
    .optionally(optional)
    .matchHeader("cookie", (value) => {
      const cookie = loadCookie(testCtx);
      expect(cookie).toBeTruthy();
      return value === cookie;
    })
    .reply(200, [testApp, testApp2, testAppWith2Environments, testAppWith0Environments])
    .persist(persist);
};
