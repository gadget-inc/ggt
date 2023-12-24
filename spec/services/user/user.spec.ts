import nock from "nock";
import process from "node:process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as login from "../../../src/commands/login.js";
import type { Context } from "../../../src/services/command/context.js";
import { config } from "../../../src/services/config/config.js";
import { loadCookie } from "../../../src/services/http/auth.js";
import * as prompt from "../../../src/services/output/prompt.js";
import { readSession, writeSession } from "../../../src/services/user/session.js";
import { getUser, getUserOrLogin } from "../../../src/services/user/user.js";
import { makeContext } from "../../__support__/context.js";
import { expectProcessExit } from "../../__support__/process.js";
import { loginTestUser, testUser } from "../../__support__/user.js";

describe("loadUser", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = makeContext();
  });

  it("returns the user if the session is set", async () => {
    loginTestUser({ optional: false });

    const user = await getUser(ctx);

    expect(nock.pendingMocks()).toEqual([]);
    expect(user).toEqual(testUser);
  });

  it("returns undefined if the session is not set", async () => {
    writeSession(undefined);
    const user = await getUser(ctx);
    expect(user).toBeUndefined();
  });

  it("returns undefined if the session is invalid or expired", async () => {
    writeSession("test");

    nock(`https://${config.domains.services}`)
      .get("/auth/api/current-user")
      .matchHeader("cookie", (value) => {
        const cookie = loadCookie();
        expect(cookie).toBeTruthy();
        return value === cookie;
      })
      .reply(401);

    const user = await getUser(ctx);

    expect(nock.pendingMocks()).toEqual([]);
    expect(user).toBeUndefined();
    expect(readSession()).toBeUndefined();
  });
});

describe("getUserOrLogin", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = makeContext();
  });

  it("returns the user if the session is set", async () => {
    loginTestUser({ optional: false });
    const user = await getUserOrLogin(ctx);

    expect(nock.pendingMocks()).toEqual([]);
    expect(user).toEqual(testUser);
  });

  it("prompts the user to log in if the session is not set", async () => {
    vi.spyOn(prompt, "confirm").mockResolvedValue();
    vi.spyOn(process, "exit");

    vi.spyOn(login, "login").mockImplementation(() => {
      loginTestUser({ optional: false });
      return Promise.resolve();
    });

    writeSession(undefined);

    const returnedUser = await getUserOrLogin(ctx);

    expect(prompt.confirm).toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(login.login).toHaveBeenCalled();
    expect(returnedUser).toEqual(testUser);
  });

  it("prompts the user to log in if the session is invalid or expired", async () => {
    vi.spyOn(prompt, "confirm").mockResolvedValue();
    vi.spyOn(process, "exit");
    vi.spyOn(login, "login").mockImplementation(() => {
      loginTestUser({ optional: false });
      return Promise.resolve();
    });

    nock(`https://${config.domains.services}`).get("/auth/api/current-user").reply(401);

    writeSession("test");
    await expect(getUserOrLogin(ctx)).resolves.toEqual(testUser);

    expect(nock.pendingMocks()).toEqual([]);
    expect(prompt.confirm).toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
    expect(login.login).toHaveBeenCalled();
  });

  it("calls process.exit if the user declines to log in", async () => {
    writeSession(undefined);
    prompt.confirm.mockImplementationOnce(() => process.exit(0));

    await expectProcessExit(() => getUserOrLogin(ctx));

    expect(prompt.confirm).toHaveBeenCalled();
    expect(login.login).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
