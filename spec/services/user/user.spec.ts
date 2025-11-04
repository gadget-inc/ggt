import { http } from "msw";
import process from "node:process";
import { describe, expect, it, vi } from "vitest";
import * as login from "../../../src/commands/login.js";
import { config } from "../../../src/services/config/config.js";
import { loadCookie } from "../../../src/services/http/auth.js";
import { confirm } from "../../../src/services/output/confirm.js";
import { readSession, writeSession } from "../../../src/services/user/session.js";
import { getUser, getUserOrLogin } from "../../../src/services/user/user.js";
import { testCtx } from "../../__support__/context.js";
import { mock, mockConfirmOnce } from "../../__support__/mock.js";
import { mockServer } from "../../__support__/msw.js";
import { expectProcessExit } from "../../__support__/process.js";
import { loginTestUser, loginTestUserWithCookie, testUser } from "../../__support__/user.js";

describe("loadUser", () => {
  it("returns the user if the session is set", async () => {
    loginTestUser();

    const user = await getUser(testCtx);

    expect(user).toEqual(testUser);
  });

  it("returns undefined if the session is not set", async () => {
    writeSession(testCtx, undefined);
    const user = await getUser(testCtx);
    expect(user).toBeUndefined();
  });

  it("returns undefined if the session is invalid or expired", async () => {
    writeSession(testCtx, "test");

    mockServer.use(
      http.get(`https://${config.domains.services}/auth/api/current-user`, ({ request }) => {
        const cookie = loadCookie(testCtx);
        const cookieHeader = request.headers.get("cookie");

        expect(cookie).toBeTruthy();
        expect(cookieHeader).toBe(cookie);

        return new Response("Unauthorized", { status: 401 });
      }),
    );

    const user = await getUser(testCtx);

    expect(user).toBeUndefined();
    expect(readSession(testCtx)).toBeUndefined();
  });
});

describe("getUserOrLogin", () => {
  it("returns the user if the session is set", async () => {
    loginTestUser();
    const user = await getUserOrLogin(testCtx, "dev");

    expect(user).toEqual(testUser);
  });

  it("prompts the user to log in if the session is not set", async () => {
    mockConfirmOnce();
    vi.spyOn(process, "exit");

    mock(login, "login", () => {
      loginTestUserWithCookie();
    });

    writeSession(testCtx, undefined);

    const returnedUser = await getUserOrLogin(testCtx, "dev");

    expect(confirm).toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(login.login).toHaveBeenCalled();
    expect(returnedUser).toEqual(testUser);
  });

  it("prompts the user to log in if the session is invalid or expired", async () => {
    mockConfirmOnce();
    vi.spyOn(process, "exit");
    mock(login, "login", () => {
      loginTestUser();
      return Promise.resolve();
    });

    mockServer.use(
      http.get(`https://${config.domains.services}/auth/api/current-user`, () => {
        return new Response("Unauthorized", { status: 401 });
      }),
    );

    writeSession(testCtx, "test");
    await expect(getUserOrLogin(testCtx, "dev")).resolves.toEqual(testUser);

    expect(confirm).toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(login.login).toHaveBeenCalled();
  });

  it("calls process.exit if the user declines to log in", async () => {
    writeSession(testCtx, undefined);
    mock(confirm, () => process.exit(0));
    mock(login, "login", () => {
      loginTestUser();
      return Promise.resolve();
    });

    await expectProcessExit(() => getUserOrLogin(testCtx, "dev"));

    expect(confirm).toHaveBeenCalled();
    expect(login.login).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
