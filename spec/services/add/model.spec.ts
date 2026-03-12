import { GraphQLError } from "graphql";
import { beforeEach, describe, expect, it } from "vitest";

import { AddClientError } from "../../../src/commands/add.js";
import { addModel, parseFieldValues } from "../../../src/services/add/model.js";
import { CREATE_MODEL_MUTATION } from "../../../src/services/app/edit/operation.js";
import { nockTestApps } from "../../__support__/app.js";
import { testCtx } from "../../__support__/context.js";
import { expectError } from "../../__support__/error.js";
import { makeSyncScenario } from "../../__support__/filesync.js";
import { nockEditResponse } from "../../__support__/graphql.js";
import { loginTestUser } from "../../__support__/user.js";

describe("parseFieldValues", () => {
  it("parses a single field definition", () => {
    const [fields, problems] = parseFieldValues(["title:string"]);
    expect(problems).toEqual([]);
    expect(fields).toEqual([{ name: "title", fieldType: "string" }]);
  });

  it("parses multiple field definitions", () => {
    const [fields, problems] = parseFieldValues(["title:string", "count:number", "active:boolean"]);
    expect(problems).toEqual([]);
    expect(fields).toEqual([
      { name: "title", fieldType: "string" },
      { name: "count", fieldType: "number" },
      { name: "active", fieldType: "boolean" },
    ]);
  });

  it("strips extra colons from the field name", () => {
    const [fields, problems] = parseFieldValues(["na::me:string"]);
    expect(problems).toEqual([]);
    expect(fields).toEqual([{ name: "name", fieldType: "string" }]);
  });

  it("reports a problem for missing type after colon", () => {
    const [fields, problems] = parseFieldValues(["title:"]);
    expect(fields).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("is not a valid field definition");
  });

  it("reports a problem for bare colon", () => {
    const [fields, problems] = parseFieldValues([":"]);
    expect(fields).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("is not a valid field definition");
  });

  it("reports a problem for missing colon separator", () => {
    const [fields, problems] = parseFieldValues(["field;string"]);
    expect(fields).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("is not a valid field definition");
  });

  it("reports a problem for empty string", () => {
    const [fields, problems] = parseFieldValues([""]);
    expect(fields).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("is not a valid field definition");
  });

  it("returns empty arrays for empty input", () => {
    const [fields, problems] = parseFieldValues([]);
    expect(fields).toEqual([]);
    expect(problems).toEqual([]);
  });

  it("collects problems and valid fields together", () => {
    const [fields, problems] = parseFieldValues(["title:string", "bad", "count:number"]);
    expect(fields).toEqual([
      { name: "title", fieldType: "string" },
      { name: "count", fieldType: "number" },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("is not a valid field definition");
  });
});

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
