import { GraphQLError } from "graphql";
import { beforeEach, describe, expect, it } from "vitest";

import { addRoute } from "../../../src/services/add/route.ts";
import { CREATE_ROUTE_MUTATION } from "../../../src/services/app/edit/operation.ts";
import { FlagError } from "../../../src/services/command/flag.ts";
import { nockTestApps } from "../../__support__/app.ts";
import { testCtx } from "../../__support__/context.ts";
import { expectError } from "../../__support__/error.ts";
import { makeSyncScenario } from "../../__support__/filesync.ts";
import { nockEditResponse } from "../../__support__/graphql.ts";
import { loginTestUser } from "../../__support__/user.ts";

describe("addRoute", () => {
  beforeEach(async () => {
    loginTestUser();
    nockTestApps();
    await makeSyncScenario();
  });

  it("creates a route", async () => {
    const { syncJson, filesync } = await makeSyncScenario();

    nockEditResponse({
      operation: CREATE_ROUTE_MUTATION,
      response: { data: { createRoute: { remoteFilesVersion: "10", changed: [] } } },
      expectVariables: { method: "GET", path: "/hello" },
    });

    const result = await addRoute(testCtx, { syncJson, filesync, method: "GET", path: "/hello" });

    expect(result.method).toBe("GET");
    expect(result.path).toBe("/hello");
    expect(result.remoteFilesVersion).toBe("10");
    expect(result.changed).toEqual([]);
  });

  it("creates a route with different HTTP methods", async () => {
    const { syncJson, filesync } = await makeSyncScenario();

    nockEditResponse({
      operation: CREATE_ROUTE_MUTATION,
      response: { data: { createRoute: { remoteFilesVersion: "10", changed: [] } } },
      expectVariables: { method: "POST", path: "/webhooks/stripe" },
    });

    const result = await addRoute(testCtx, { syncJson, filesync, method: "POST", path: "/webhooks/stripe" });

    expect(result.method).toBe("POST");
    expect(result.path).toBe("/webhooks/stripe");
  });

  it("throws FlagError on API error", async () => {
    const { syncJson, filesync } = await makeSyncScenario();

    nockEditResponse({
      operation: CREATE_ROUTE_MUTATION,
      response: { errors: [new GraphQLError("Route already exists")] },
      statusCode: 200,
    });

    const error = await expectError(() => addRoute(testCtx, { syncJson, filesync, method: "GET", path: "/hello" }));
    expect(error).toBeInstanceOf(FlagError);
  });
});
