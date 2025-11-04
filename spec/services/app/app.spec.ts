import { http } from "msw";
import { describe, expect, it } from "vitest";
import { getApplications } from "../../../src/services/app/app.js";
import { config } from "../../../src/services/config/config.js";
import { loadCookie } from "../../../src/services/http/auth.js";
import { testApp } from "../../__support__/app.js";
import { testCtx } from "../../__support__/context.js";
import { mockServer } from "../../__support__/msw.js";
import { loginTestUser } from "../../__support__/user.js";

describe("getApplications", () => {
  it("returns the available apps if the session is set", async () => {
    loginTestUser();

    const apps = [testApp];
    mockServer.use(
      http.get(`https://${config.domains.services}/auth/api/apps`, ({ request }) => {
        // Verify that auth headers are present
        const hasToken = request.headers.has("x-platform-access-token");
        const hasCookie = request.headers.has("cookie");

        if (!hasToken && !hasCookie) {
          return new Response("Unauthorized", { status: 401 });
        }

        return Response.json(apps);
      }),
    );

    await expect(getApplications(testCtx)).resolves.toEqual(apps);
  });

  it("returns an empty array if the session is not set", async () => {
    expect(loadCookie(testCtx)).toBeUndefined();
    await expect(getApplications(testCtx)).resolves.toEqual([]);
  });
});
