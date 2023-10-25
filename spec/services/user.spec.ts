import enquirer from "enquirer";
import nock from "nock";
import process from "node:process";
import { describe, expect, it, vi } from "vitest";
import * as login from "../../src/commands/login.js";
import { config } from "../../src/services/config.js";
import { loadCookie } from "../../src/services/http.js";
import { readSession, writeSession } from "../../src/services/session.js";
import { getUser, getUserOrLogin } from "../../src/services/user.js";
import { expectProcessExit, loginTestUser, testUser } from "../util.js";

describe("user", () => {
  describe("loadUser", () => {
    it("returns the user if the session is set", async () => {
      loginTestUser();

      const user = await getUser();

      expect(nock.isDone()).toBe(true);
      expect(user).toEqual(testUser);
    });

    it("returns undefined if the session is not set", async () => {
      writeSession(undefined);
      const user = await getUser();
      expect(user).toBeUndefined();
    });

    it("returns undefined if the session is invalid or expired", async () => {
      writeSession("test");
      nock(`https://${config.domains.services}`).get("/auth/api/current-user").matchHeader("cookie", loadCookie()!).reply(401);

      const user = await getUser();

      expect(nock.isDone()).toBe(true);
      expect(user).toBeUndefined();
      expect(readSession()).toBeUndefined();
    });

    it.skip("caches the user", async () => {
      nock(`https://${config.domains.services}`).get("/auth/api/current-user").reply(200, testUser);
      writeSession("test");

      await expect(getUser()).resolves.toEqual(testUser);

      for (let i = 0; i < 10; i++) {
        expect(nock.isDone()).toBe(true);
        await expect(getUser()).resolves.toEqual(testUser);
      }
    });
  });

  describe("getUserOrLogin", () => {
    it("returns the user if the session is set", async () => {
      loginTestUser();
      const user = await getUserOrLogin();

      expect(nock.isDone()).toBe(true);
      expect(user).toEqual(testUser);
    });

    it("prompts the user to log in if the session is not set", async () => {
      enquirer.prompt.mockResolvedValue({ result: true });
      vi.spyOn(process, "exit");

      vi.spyOn(login, "run").mockImplementation(() => {
        loginTestUser();
        return Promise.resolve();
      });

      writeSession(undefined);

      const returnedUser = await getUserOrLogin();

      expect(enquirer.prompt).toHaveBeenCalled();
      expect(process.exit).not.toHaveBeenCalled();
      expect(login.run).toHaveBeenCalled();
      expect(returnedUser).toEqual(testUser);
    });

    it("prompts the user to log in if the session is invalid or expired", async () => {
      enquirer.prompt.mockResolvedValue({ result: true });
      vi.spyOn(process, "exit");
      vi.spyOn(login, "run").mockImplementation(() => {
        loginTestUser();
        return Promise.resolve();
      });

      nock(`https://${config.domains.services}`).get("/auth/api/current-user").reply(401);

      writeSession("test");
      await expect(getUserOrLogin()).resolves.toEqual(testUser);

      expect(nock.isDone()).toBe(true);
      expect(enquirer.prompt).toHaveBeenCalled();
      expect(process.exit).not.toHaveBeenCalled();
      expect(login.run).toHaveBeenCalled();
    });

    it("calls process.exit if the user declines to log in", async () => {
      writeSession(undefined);
      enquirer.prompt.mockResolvedValue({ result: false });

      await expectProcessExit(() => getUserOrLogin());

      expect(enquirer.prompt).toHaveBeenCalled();
      expect(login.run).not.toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });
});
