import nock from "nock";
import { EnvironmentType, type Application, type Environment } from "../../src/services/app/app.js";
import { config } from "../../src/services/config/config.js";
import { matchAuthHeader } from "./user.js";

/**
 * A Gadget app to use in tests.
 */
export const testApp: Application = Object.freeze({
  id: 1n,
  slug: "test",
  primaryDomain: "test.gadget.app",
  environments: [
    {
      id: 1n,
      name: "development",
      type: EnvironmentType.Development,
      nodeVersion: "22.15.0",
    },
    {
      id: 2n,
      name: "production",
      type: EnvironmentType.Production,
      nodeVersion: "22.15.0",
    },
    {
      id: 3n,
      name: "cool-environment-development",
      type: EnvironmentType.Development,
      nodeVersion: "22.15.0",
    },
    {
      id: 4n,
      name: "other-environment-development",
      type: EnvironmentType.Development,
      nodeVersion: "22.15.0",
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
 * Sets up a response for the apps endpoint that `getApps` uses.
 */
export const nockTestApps = ({ optional = true, persist = true } = {}): void => {
  matchAuthHeader(
    nock(`https://${config.domains.services}`).get("/auth/api/apps").optionally(optional).reply(200, [testApp, testApp2]).persist(persist),
  );
};
