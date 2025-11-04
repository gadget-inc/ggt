import { http } from "msw";
import { randomUUID } from "node:crypto";
import { expect, vi } from "vitest";
import { config } from "../../src/services/config/config.js";
import { loadCookie } from "../../src/services/http/auth.js";
import { readToken, writeSession } from "../../src/services/user/session.js";
import type { User } from "../../src/services/user/user.js";
import { testCtx } from "./context.js";
import { mockServer } from "./msw.js";

/**
 * A test user to use in tests.
 */
export const testUser: User = Object.freeze({
  id: 1,
  email: "test@example.com",
  name: "Jane Doe",
});

export const loginTestUserWithToken = (): void => {
  vi.stubEnv("GGT_TOKEN", "gpat-test-token");

  mockServer.use(
    http.get(`https://${config.domains.services}/auth/api/current-user`, ({ request }) => {
      const token = readToken(testCtx);
      const authHeader = request.headers.get("x-platform-access-token");

      expect(token).toBeTruthy();
      expect(authHeader).toBe(token);

      return Response.json(testUser);
    }),
  );
};

export const loginTestUserWithCookie = (): void => {
  writeSession(testCtx, randomUUID());

  mockServer.use(
    http.get(`https://${config.domains.services}/auth/api/current-user`, ({ request }) => {
      const cookie = loadCookie(testCtx);
      const cookieHeader = request.headers.get("cookie");

      expect(cookie).toBeTruthy();
      expect(cookieHeader).toBe(cookie);

      return Response.json(testUser);
    }),
  );
};

/**
 * Sets up a response for the current-user endpoint that `getUser` uses.
 */
export const loginTestUser = (): void => {
  if (Math.random() > 0.5) {
    loginTestUserWithCookie();
  } else {
    loginTestUserWithToken();
  }
};
