import { GraphQLError } from "graphql";
import { beforeEach, describe, expect, it } from "vitest";

import { AddClientError } from "../../../src/commands/add.js";
import { addFields, parseFieldTarget } from "../../../src/services/add/field.js";
import { CREATE_MODEL_FIELDS_MUTATION } from "../../../src/services/app/edit/operation.js";
import { nockTestApps } from "../../__support__/app.js";
import { testCtx } from "../../__support__/context.js";
import { expectError } from "../../__support__/error.js";
import { makeSyncScenario } from "../../__support__/filesync.js";
import { nockEditResponse } from "../../__support__/graphql.js";
import { loginTestUser } from "../../__support__/user.js";

describe("parseFieldTarget", () => {
  it("parses model/field:type", () => {
    const result = parseFieldTarget("post/title:string");
    expect(result).toEqual({
      modelApiIdentifier: "post",
      fieldName: "title",
      fieldType: "string",
      problems: [],
    });
  });

  it("parses different field types", () => {
    expect(parseFieldTarget("user/active:boolean")).toEqual({
      modelApiIdentifier: "user",
      fieldName: "active",
      fieldType: "boolean",
      problems: [],
    });

    expect(parseFieldTarget("user/age:number")).toEqual({
      modelApiIdentifier: "user",
      fieldName: "age",
      fieldType: "number",
      problems: [],
    });
  });

  it("returns missing field definition for bare model name", () => {
    const result = parseFieldTarget("user");
    expect(result.problems).toEqual(["Missing field definition"]);
  });

  it("returns missing field definition for model with trailing slash", () => {
    const result = parseFieldTarget("user/");
    expect(result.problems).toEqual(["Missing field definition"]);
  });

  it("reports invalid field definition for missing type", () => {
    const result = parseFieldTarget("user/field:");
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("is not a valid field definition");
  });

  it("reports invalid field definition for missing name", () => {
    const result = parseFieldTarget("user/:");
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("is not a valid field definition");
  });

  it("reports invalid field definition for field without colon", () => {
    const result = parseFieldTarget("user/field");
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("is not a valid field definition");
  });
});

describe("addFields", () => {
  beforeEach(async () => {
    loginTestUser();
    nockTestApps();
    await makeSyncScenario();
  });

  it("adds a field to a model", async () => {
    const { syncJson, filesync } = await makeSyncScenario();

    nockEditResponse({
      operation: CREATE_MODEL_FIELDS_MUTATION,
      response: { data: { createModelFields: { remoteFilesVersion: "10", changed: [] } } },
      expectVariables: {
        path: "post",
        fields: [{ name: "title", fieldType: "string" }],
      },
    });

    const result = await addFields(testCtx, {
      syncJson,
      filesync,
      modelApiIdentifier: "post",
      fields: [{ name: "title", fieldType: "string" }],
    });

    expect(result.fieldName).toBe("title");
    expect(result.remoteFilesVersion).toBe("10");
    expect(result.changed).toEqual([]);
  });

  it("throws AddClientError on API error", async () => {
    const { syncJson, filesync } = await makeSyncScenario();

    nockEditResponse({
      operation: CREATE_MODEL_FIELDS_MUTATION,
      response: { errors: [new GraphQLError("Model not found")] },
      statusCode: 200,
    });

    const error = await expectError(() =>
      addFields(testCtx, {
        syncJson,
        filesync,
        modelApiIdentifier: "post",
        fields: [{ name: "title", fieldType: "string" }],
      }),
    );
    expect(error).toBeInstanceOf(AddClientError);
  });
});
