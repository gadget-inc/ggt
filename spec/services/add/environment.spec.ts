import { GraphQLError } from "graphql";
import { beforeEach, describe, expect, it } from "vitest";

import { EnvironmentStatus } from "../../../src/__generated__/graphql.js";
import { AddClientError } from "../../../src/commands/add.js";
import { addEnvironment, generateDefaultEnvName } from "../../../src/services/add/environment.js";
import { CREATE_ENVIRONMENT_MUTATION } from "../../../src/services/app/edit/operation.js";
import { nockTestApps } from "../../__support__/app.js";
import { testCtx } from "../../__support__/context.js";
import { expectError } from "../../__support__/error.js";
import { makeSyncScenario } from "../../__support__/filesync.js";
import { nockEditResponse } from "../../__support__/graphql.js";
import { mockSystemTime } from "../../__support__/time.js";
import { loginTestUser } from "../../__support__/user.js";

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

  it("throws AddClientError on API error", async () => {
    const { syncJson } = await makeSyncScenario();

    nockEditResponse({
      operation: CREATE_ENVIRONMENT_MUTATION,
      response: { errors: [new GraphQLError("Environment limit reached")] },
      statusCode: 200,
    });

    const error = await expectError(() => addEnvironment(testCtx, { syncJson, name: "staging" }));
    expect(error).toBeInstanceOf(AddClientError);
  });
});
