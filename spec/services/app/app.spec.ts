import nock from "nock";
import { describe, expect, it } from "vitest";

import { getApplications } from "../../../src/services/app/app.js";
import { config } from "../../../src/services/config/config.js";
import { loadCookie } from "../../../src/services/http/auth.js";
import { testApp } from "../../__support__/app.js";
import { testCtx } from "../../__support__/context.js";
import { loginTestUser, matchAuthHeader } from "../../__support__/user.js";

describe("getApplications", () => {
  it("returns the available apps if the session is set", async () => {
    loginTestUser();

    const apps = [testApp];
    matchAuthHeader(nock(`https://${config.domains.services}`).get("/auth/api/apps").reply(200, apps));

    await expect(getApplications(testCtx)).resolves.toEqual(apps);
    expect(nock.isDone()).toBe(true);
  });

  it("returns an empty array if the session is not set", async () => {
    expect(loadCookie(testCtx)).toBeUndefined();
    await expect(getApplications(testCtx)).resolves.toEqual([]);
  });
});
