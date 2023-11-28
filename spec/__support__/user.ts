import nock from "nock";
import { expect } from "vitest";
import { config } from "../../src/services/config/config.js";
import { writeSession } from "../../src/services/user/session.js";
import type { User } from "../../src/services/user/user.js";
import { loadCookie } from "../../src/services/util/http.js";

export const testUser: User = {
  id: 1,
  email: "test@example.com",
  name: "Jane Doe",
};

export const loginTestUser = ({ optional = true } = {}): void => {
  writeSession("test");

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
