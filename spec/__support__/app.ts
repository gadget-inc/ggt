import { http } from "msw";
import { EnvironmentType, type Application, type Environment } from "../../src/services/app/app.js";
import { config } from "../../src/services/config/config.js";
import { mockServer } from "./msw.js";

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
      nodeVersion: "22.15.0",
    },
    {
      id: 2n,
      name: "production",
      type: EnvironmentType.Production,
      nodeVersion: "22.15.0",
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
export const mockTestApps = (): void => {
  mockServer.use(
    http.get(`https://${config.domains.services}/auth/api/apps`, ({ request }) => {
      // Verify that auth headers are present (either token or cookie)
      const hasToken = request.headers.has("x-platform-access-token");
      const hasCookie = request.headers.has("cookie");

      if (!hasToken && !hasCookie) {
        return new Response("Unauthorized", { status: 401 });
      }

      return Response.json([testApp, testApp2, testAppWith2Environments, testAppWith0Environments]);
    }),
  );
};
