import process from "node:process";

import nock from "nock";
import { describe, expect, it, vi } from "vitest";

import login from "../../../src/commands/login.ts";
import { config } from "../../../src/services/config/config.ts";
import { loadCookie } from "../../../src/services/http/auth.ts";
import { confirm } from "../../../src/services/output/confirm.ts";
import { readSession, writeSession } from "../../../src/services/user/session.ts";
import { getUser, getUserOrLogin } from "../../../src/services/user/user.ts";
import { testCtx } from "../../__support__/context.ts";
import { mock, mockConfirmOnce } from "../../__support__/mock.ts";
import { expectProcessExit } from "../../__support__/process.ts";
import { loginTestUser, loginTestUserWithCookie, testUser } from "../../__support__/user.ts";

describe("loadUser", () => {
  it("returns the user if the session is set", async () => {
    loginTestUser({ optional: false });

    const user = await getUser(testCtx);

    expect(nock.pendingMocks()).toEqual([]);
    expect(user).toEqual(testUser);
  });

  it("returns undefined if the session is not set", async () => {
    writeSession(testCtx, undefined);
    const user = await getUser(testCtx);
    expect(user).toBeUndefined();
  });

  it("returns undefined if the session is invalid or expired", async () => {
    writeSession(testCtx, "test");

    nock(`https://${config.domains.services}`)
      .get("/auth/api/current-user")
      .matchHeader("cookie", (value) => {
        const cookie = loadCookie(testCtx);
        expect(cookie).toBeTruthy();
        return value === cookie;
      })
      .reply(401);

    const user = await getUser(testCtx);

    expect(nock.pendingMocks()).toEqual([]);
    expect(user).toBeUndefined();
    expect(readSession(testCtx)).toBeUndefined();
  });
});

describe("getUserOrLogin", () => {
  it("returns the user if the session is set", async () => {
    loginTestUser({ optional: false });
    const user = await getUserOrLogin(testCtx, "dev");

    expect(nock.pendingMocks()).toEqual([]);
    expect(user).toEqual(testUser);
  });

  it("prompts the user to log in if the session is not set", async () => {
    mockConfirmOnce();
    vi.spyOn(process, "exit");

    mock(login, "run", () => {
      loginTestUserWithCookie({ optional: false });
    });

    writeSession(testCtx, undefined);

    const returnedUser = await getUserOrLogin(testCtx, "dev");

    expect(confirm).toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(login.run).toHaveBeenCalled();
    expect(returnedUser).toEqual(testUser);
  });

  it("prompts the user to log in if the session is invalid or expired", async () => {
    mockConfirmOnce();
    vi.spyOn(process, "exit");
    mock(login, "run", () => {
      loginTestUser({ optional: false });
      return Promise.resolve();
    });

    nock(`https://${config.domains.services}`).get("/auth/api/current-user").reply(401);

    writeSession(testCtx, "test");
    await expect(getUserOrLogin(testCtx, "dev")).resolves.toEqual(testUser);

    expect(nock.pendingMocks()).toEqual([]);
    expect(confirm).toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(login.run).toHaveBeenCalled();
  });

  it("calls process.exit if the user declines to log in", async () => {
    writeSession(testCtx, undefined);
    mock(confirm, () => process.exit(0));
    mock(login, "run", () => {
      loginTestUser({ optional: false });
      return Promise.resolve();
    });

    await expectProcessExit(() => getUserOrLogin(testCtx, "dev"));

    expect(confirm).toHaveBeenCalled();
    expect(login.run).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
