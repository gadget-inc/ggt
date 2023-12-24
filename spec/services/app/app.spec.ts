import nock from "nock";
import { beforeEach, describe, expect, it } from "vitest";
import { getApps } from "../../../src/services/app/app.js";
import type { Context } from "../../../src/services/command/context.js";
import { config } from "../../../src/services/config/config.js";
import { loadCookie } from "../../../src/services/http/auth.js";
import { writeSession } from "../../../src/services/user/session.js";
import { testApp } from "../../__support__/app.js";
import { makeContext } from "../../__support__/context.js";
import { testUser } from "../../__support__/user.js";

describe("getApps", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = makeContext();
  });

  it("returns the available apps if the session is set", async () => {
    const apps = [testApp];
    writeSession("test");
    nock(`https://${config.domains.services}`).get("/auth/api/apps").matchHeader("cookie", loadCookie()!).reply(200, apps);

    await expect(getApps(ctx, testUser)).resolves.toEqual(apps);
    expect(nock.isDone()).toBe(true);
  });

  it("returns an empty array if the session is not set", async () => {
    writeSession(undefined);
    await expect(getApps(ctx, testUser)).resolves.toEqual([]);
  });
});
