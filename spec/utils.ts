import nock from "nock";
import { beforeEach, describe, vi } from "vitest";
import { config } from "../src/services/config/config.js";
import { readToken } from "../src/services/user/session.js";
import { nockTestApps, testApp, testApp2, testAppWith0Environments, testAppWith2Environments } from "./__support__/app.js";
import { loginTestUser, testUser } from "./__support__/user.js";

export const describeWithTokenAndCookieAuthentication = (suite: () => void): void => {
  describe("with cookie authentication", () => {
    beforeEach(() => {
      loginTestUser();
      nockTestApps();
    });

    suite();
  });

  describe("with token authentication", () => {
    beforeEach(() => {
      vi.stubEnv("GGT_TOKEN", "gpat-test-token");

      nock(`https://${config.domains.services}`)
        .get("/auth/api/current-user")
        .matchHeader("x-platform-access-token", (value) => {
          const token = readToken();
          return value === token;
        })
        .optionally(false)
        .reply(200, testUser)
        .persist();

      nock(`https://${config.domains.services}`)
        .get("/auth/api/apps")
        .optionally(false)
        .matchHeader("x-platform-access-token", (value) => {
          const token = readToken();
          return value === token;
        })
        .reply(200, [testApp, testApp2, testAppWith2Environments, testAppWith0Environments])
        .persist();
    });

    suite();
  });
};
