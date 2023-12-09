import nock from "nock";
import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { config } from "../../src/services/config/config.js";
import { loadCookie } from "../../src/services/http/auth.js";
import { writeSession } from "../../src/services/user/session.js";
import type { User } from "../../src/services/user/user.js";

/**
 * A test user to use in tests.
 */
export const testUser: User = Object.freeze({
  id: 1,
  email: "test@example.com",
  name: "Jane Doe",
});

/**
 * Sets up a response for the current-user endpoint that `getUser` uses.
 */
export const loginTestUser = ({ optional = true } = {}): void => {
  writeSession(randomUUID());

  nock(`https://${config.domains.services}`)
    .get("/auth/api/current-user")
    .optionally(optional)
    .matchHeader("cookie", (value) => {
      const cookie = loadCookie();
      expect(cookie).toBeTruthy();
      return value === cookie;
    })
    .reply(200, testUser)
    .persist();
};
