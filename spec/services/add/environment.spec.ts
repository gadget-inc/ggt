import { GraphQLError } from "graphql";
import { beforeEach, describe, expect, it } from "vitest";

import { EnvironmentStatus } from "../../../src/__generated__/graphql.ts";
import { EditClientError } from "../../../src/commands/add.ts";
import { addEnvironment, generateDefaultEnvName } from "../../../src/services/add/environment.ts";
import { CREATE_ENVIRONMENT_MUTATION } from "../../../src/services/app/edit/operation.ts";
import { nockTestApps } from "../../__support__/app.ts";
import { testCtx } from "../../__support__/context.ts";
import { expectError } from "../../__support__/error.ts";
import { makeSyncScenario } from "../../__support__/filesync.ts";
import { nockEditResponse } from "../../__support__/graphql.ts";
import { mockSystemTime } from "../../__support__/time.ts";
import { loginTestUser } from "../../__support__/user.ts";

mockSystemTime();

describe("generateDefaultEnvName", () => {
  it("generates a name from the current UTC timestamp", () => {
    // mockSystemTime sets Date to epoch (1970-01-01T00:00:00Z)
    expect(generateDefaultEnvName()).toBe("env-19700101-000000");
  });
});

describe("addEnvironment", () => {
  beforeEach(async () => {
    loginTestUser();
    nockTestApps();
    await makeSyncScenario();
  });

  it("creates an environment with an explicit name", async () => {
    const { syncJson } = await makeSyncScenario();

    nockEditResponse({
      operation: CREATE_ENVIRONMENT_MUTATION,
      response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
      expectVariables: { environment: { slug: "staging", sourceSlug: "development" } },
    });

    const result = await addEnvironment(testCtx, { syncJson, name: "staging" });

    expect(result.name).toBe("staging");
  });

  it("creates an environment with a generated name", async () => {
    const { syncJson } = await makeSyncScenario();

    const name = generateDefaultEnvName();

    nockEditResponse({
      operation: CREATE_ENVIRONMENT_MUTATION,
      response: { data: { createEnvironment: { slug: name, status: EnvironmentStatus.Active } } },
      expectVariables: { environment: { slug: name, sourceSlug: "development" } },
    });

    const result = await addEnvironment(testCtx, { syncJson, name });

    expect(result.name).toBe(name);
  });

  it("throws EditClientError on API error", async () => {
    const { syncJson } = await makeSyncScenario();

    nockEditResponse({
      operation: CREATE_ENVIRONMENT_MUTATION,
      response: { errors: [new GraphQLError("Environment limit reached")] },
      statusCode: 200,
    });

    const error = await expectError(() => addEnvironment(testCtx, { syncJson, name: "staging" }));
    expect(error).toBeInstanceOf(EditClientError);
  });
});
