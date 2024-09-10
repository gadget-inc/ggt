import nock from "nock";
import { randomUUID } from "node:crypto";
import { expect, vi } from "vitest";
import { config } from "../../src/services/config/config.js";
import { loadCookie } from "../../src/services/http/auth.js";
import { readToken, writeSession } from "../../src/services/user/session.js";
import type { User } from "../../src/services/user/user.js";
import { testCtx } from "./context.js";

/**
 * A test user to use in tests.
 */
export const testUser: User = Object.freeze({
  id: 1,
  email: "test@example.com",
  name: "Jane Doe",
});

export let matchAuthHeader: (scope: nock.Scope) => nock.Scope;

export const loginTestUserWithToken = ({ optional = false }): void => {
  matchAuthHeader = (scope: nock.Scope) => {
    return scope.matchHeader("x-platform-access-token", (value) => {
      const token = readToken(testCtx);
      expect(token).toBeTruthy();
      return value === token;
    });
  };

  vi.stubEnv("GGT_TOKEN", "gpat-test-token");

  matchAuthHeader(
    nock(`https://${config.domains.services}`).get("/auth/api/current-user").optionally(optional).reply(200, testUser).persist(),
  );
};

export const loginTestUserWithCookie = ({ optional = false } = {}): void => {
  matchAuthHeader = (scope: nock.Scope) => {
    return scope.matchHeader("cookie", (value) => {
      const cookie = loadCookie(testCtx);
      expect(cookie).toBeTruthy();
      return value === cookie;
    });
  };

  writeSession(testCtx, randomUUID());

  matchAuthHeader(
    nock(`https://${config.domains.services}`).get("/auth/api/current-user").optionally(optional).reply(200, testUser).persist(),
  );
};

/**
 * Sets up a response for the current-user endpoint that `getUser` uses.
 */
export const loginTestUser = ({ optional = true } = {}): void => {
  if (Math.random() > 0.5) {
    loginTestUserWithCookie({ optional });
  } else {
    loginTestUserWithToken({ optional });
  }
};
