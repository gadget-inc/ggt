import { GraphQLError } from "graphql";
import { beforeEach, describe, expect, it } from "vitest";

import { AddClientError } from "../../../src/commands/add.ts";
import { addFields, parseFieldTarget, parseFieldValues } from "../../../src/services/add/field.ts";
import { CREATE_MODEL_FIELDS_MUTATION } from "../../../src/services/app/edit/operation.ts";
import { nockTestApps } from "../../__support__/app.ts";
import { testCtx } from "../../__support__/context.ts";
import { expectError } from "../../__support__/error.ts";
import { makeSyncScenario } from "../../__support__/filesync.ts";
import { nockEditResponse } from "../../__support__/graphql.ts";
import { loginTestUser } from "../../__support__/user.ts";

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
