import nock from "nock";
import { expect } from "vitest";
import { config } from "../../src/services/config.js";
import { loadCookie } from "../../src/services/http.js";
import { writeSession } from "../../src/services/session.js";
import type { User } from "../../src/services/user.js";

export const testUser: User = {
  id: 1,
  email: "test@example.com",
  name: "Jane Doe",
};

export const loginTestUser = (): void => {
  writeSession("test");
  const cookie = loadCookie();
  expect(cookie, "Cookie to be set after writing session").toBeTruthy();
  nock(`https://${config.domains.services}`).get("/auth/api/current-user").matchHeader("cookie", cookie!).reply(200, testUser);
};
