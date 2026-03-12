import { GraphQLError } from "graphql";
import { beforeEach, describe, expect, it } from "vitest";

import { AddClientError } from "../../../src/commands/add.js";
import { addModel } from "../../../src/services/add/model.js";
import { CREATE_MODEL_MUTATION } from "../../../src/services/app/edit/operation.js";
import { nockTestApps } from "../../__support__/app.js";
import { testCtx } from "../../__support__/context.js";
import { expectError } from "../../__support__/error.js";
import { makeSyncScenario } from "../../__support__/filesync.js";
import { nockEditResponse } from "../../__support__/graphql.js";
import { loginTestUser } from "../../__support__/user.js";

describe("addModel", () => {
  beforeEach(async () => {
    loginTestUser();
    nockTestApps();
    await makeSyncScenario();
  });

  it("creates a model without fields", async () => {
    const { syncJson, filesync } = await makeSyncScenario();

    nockEditResponse({
      operation: CREATE_MODEL_MUTATION,
      response: { data: { createModel: { remoteFilesVersion: "10", changed: [] } } },
      expectVariables: { path: "post", fields: [] },
    });

    const result = await addModel(testCtx, { syncJson, filesync, modelApiIdentifier: "post" });

    expect(result.modelApiIdentifier).toBe("post");
    expect(result.remoteFilesVersion).toBe("10");
    expect(result.changed).toEqual([]);
  });

  it("creates a model with fields", async () => {
    const { syncJson, filesync } = await makeSyncScenario();

    nockEditResponse({
      operation: CREATE_MODEL_MUTATION,
      response: { data: { createModel: { remoteFilesVersion: "10", changed: [] } } },
      expectVariables: {
        path: "post",
        fields: [
          { name: "title", fieldType: "string" },
          { name: "body", fieldType: "string" },
        ],
      },
    });

    const result = await addModel(testCtx, {
      syncJson,
      filesync,
      modelApiIdentifier: "post",
      fields: [
        { name: "title", fieldType: "string" },
        { name: "body", fieldType: "string" },
      ],
    });

    expect(result.modelApiIdentifier).toBe("post");
    expect(result.remoteFilesVersion).toBe("10");
  });

  it("throws AddClientError on API error", async () => {
    const { syncJson, filesync } = await makeSyncScenario();

    nockEditResponse({
      operation: CREATE_MODEL_MUTATION,
      response: { errors: [new GraphQLError("Model already exists")] },
      statusCode: 200,
    });

    const error = await expectError(() => addModel(testCtx, { syncJson, filesync, modelApiIdentifier: "post" }));
    expect(error).toBeInstanceOf(AddClientError);
  });
});
