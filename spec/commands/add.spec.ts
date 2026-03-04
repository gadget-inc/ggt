import { beforeEach, describe, expect, it } from "vitest";

import { EnvironmentStatus } from "../../src/__generated__/graphql.js";
import add, { AddClientError } from "../../src/commands/add.js";
import { GADGET_GLOBAL_ACTIONS_QUERY, GADGET_META_MODELS_QUERY } from "../../src/services/app/api/operation.js";
import {
  CREATE_ACTION_MUTATION,
  CREATE_ENVIRONMENT_MUTATION,
  CREATE_MODEL_FIELDS_MUTATION,
  CREATE_MODEL_MUTATION,
  CREATE_ROUTE_MUTATION,
} from "../../src/services/app/edit/operation.js";
import { ClientError } from "../../src/services/app/error.js";
import { ArgError } from "../../src/services/command/arg.js";
import { runCommand } from "../../src/services/command/run.js";
import { nockTestApps } from "../__support__/app.js";
import { testCtx } from "../__support__/context.js";
import { expectError } from "../__support__/error.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { nockApiResponse, nockEditResponse } from "../__support__/graphql.js";
import { mockSystemTime } from "../__support__/time.js";
import { loginTestUser } from "../__support__/user.js";

describe("AddClientError", () => {
  it("does not double-bullet messages that already have a bullet prefix", () => {
    const cause = [{ message: "• already bulleted" }, { message: "plain text" }] as unknown as import("graphql").GraphQLError[];

    const clientError = new ClientError(undefined, cause);
    const error = new AddClientError(clientError);

    // Each line should have exactly one bullet
    expect(error.message).toMatchInlineSnapshot(`
      "• already bulleted
      • plain text"
    `);
  });
});

mockSystemTime();

describe("add", () => {
  beforeEach(async () => {
    loginTestUser();
    nockTestApps();
    await makeSyncScenario();
  });

  describe("models", () => {
    it("can add a model", async () => {
      nockEditResponse({
        operation: CREATE_MODEL_MUTATION,
        response: { data: { createModel: { remoteFilesVersion: "10", changed: [] } } },
        expectVariables: { path: "modelA", fields: [] },
      });

      await runCommand(testCtx, add, "model", "modelA");
    });

    it("can add a model with fields", async () => {
      nockEditResponse({
        operation: CREATE_MODEL_MUTATION,
        response: { data: { createModel: { remoteFilesVersion: "10", changed: [] } } },
        expectVariables: {
          path: "modelA",
          fields: [
            { name: "newField", fieldType: "string" },
            { name: "newField2", fieldType: "boolean" },
          ],
        },
      });

      await runCommand(testCtx, add, "model", "modelA", "newField:string", "newField2:boolean");
    });

    it("requires a model path", async () => {
      const error = await expectError(() => runCommand(testCtx, add, "model"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.sprint()).toMatchInlineSnapshot(`
        "✘ Missing required argument: model

        USAGE
          ggt add model <model> [field:type ...] [flags]

        Run ggt add model -h for more information."
      `);
    });

    it.each(["field;string", "field:", ":", ""])('returns ArgErrors when field argument is "%s"', async (invalidFieldArgument) => {
      const error = await expectError(() => runCommand(testCtx, add, "model", "modelA", invalidFieldArgument));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.sprint()).toContain("is not a valid field definition");
    });
  });

  describe("field", () => {
    it("can add a model field", async () => {
      nockEditResponse({
        operation: CREATE_MODEL_FIELDS_MUTATION,
        response: { data: { createModelFields: { remoteFilesVersion: "10", changed: [] } } },
        expectVariables: {
          path: "modelA",
          fields: [{ name: "newField", fieldType: "string" }],
        },
      });

      await runCommand(testCtx, add, "field", "modelA/newField:string");
    });

    it("returns an ArgError if there's no input", async () => {
      const error = await expectError(() => runCommand(testCtx, add, "field"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.usageHint).toBe(true);
      expect(error.sprint()).toMatchInlineSnapshot(`
        "✘ Missing required argument: model/field:type

        USAGE
          ggt add field <model/field:type> [flags]

        Run ggt add field -h for more information."
      `);
    });

    it.each(["user", "user/"])("returns missing field definition ArgError if the input is %s", async (partialInput) => {
      const error = await expectError(() => runCommand(testCtx, add, "field", partialInput));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.sprint()).toContain("Failed to add field, invalid field definition");
    });

    it.each(["user/field", "user/field:", "user/:"])("returns missing field type ArgError if the input is %s", async (partialInput) => {
      const error = await expectError(() => runCommand(testCtx, add, "field", partialInput));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.sprint()).toContain("is not a valid field definition");
    });
  });

  describe("actions", () => {
    beforeEach(() => {
      nockApiResponse({
        operation: GADGET_META_MODELS_QUERY,
        response: {
          data: {
            gadgetMeta: {
              models: [
                {
                  apiIdentifier: "session",
                },
                {
                  apiIdentifier: "user",
                },
                {
                  apiIdentifier: "modelA",
                },
              ],
            },
          },
        },
        persist: true,
        statusCode: 200,
        optional: true,
      });

      nockApiResponse({
        operation: GADGET_GLOBAL_ACTIONS_QUERY,
        response: {
          data: {
            gadgetMeta: {
              globalActions: [],
            },
          },
        },
        persist: true,
        statusCode: 200,
        optional: true,
      });
    });

    it("can add an action", async () => {
      nockEditResponse({
        operation: CREATE_ACTION_MUTATION,
        response: { data: { createAction: { remoteFilesVersion: "10", changed: [] } } },
        expectVariables: { path: "actionA" },
      });

      await runCommand(testCtx, add, "action", "actionA");
    });

    it("requires an action name/path", async () => {
      const error = await expectError(() => runCommand(testCtx, add, "action"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.sprint()).toMatchInlineSnapshot(`
        "✘ Missing required argument: path

        USAGE
          ggt add action <path> [flags]

        Run ggt add action -h for more information."
      `);
    });
  });

  describe("routes", () => {
    it("can add a route", async () => {
      nockEditResponse({
        operation: CREATE_ROUTE_MUTATION,
        response: { data: { createRoute: { remoteFilesVersion: "10", changed: [] } } },
        expectVariables: { method: "GET", path: "routeA" },
      });

      await runCommand(testCtx, add, "route", "GET", "routeA");
    });

    it("requires a method argument", async () => {
      const error = await expectError(() => runCommand(testCtx, add, "route"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.sprint()).toMatchInlineSnapshot(`
        "✘ Missing required argument: method

        USAGE
          ggt add route <method> <path> [flags]

        Run ggt add route -h for more information."
      `);
    });

    it("requires a route name", async () => {
      const error = await expectError(() => runCommand(testCtx, add, "route", "GET"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.sprint()).toMatchInlineSnapshot(`
        "✘ Missing required argument: path

        USAGE
          ggt add route <method> <path> [flags]

        Run ggt add route -h for more information."
      `);
    });
  });

  describe("environments", () => {
    it("generates a locale-invariant default environment name", async () => {
      nockEditResponse({
        operation: CREATE_ENVIRONMENT_MUTATION,
        response: { data: { createEnvironment: { slug: "env-19700101-000000", status: EnvironmentStatus.Active } } },
        expectVariables: { environment: { slug: "env-19700101-000000", sourceSlug: "development" } },
      });

      await runCommand(testCtx, add, "environment");
    });

    it("can add an environment with `add env`", async () => {
      nockEditResponse({
        operation: CREATE_ENVIRONMENT_MUTATION,
        response: { data: { createEnvironment: { slug: "development2", status: EnvironmentStatus.Active } } },
        expectVariables: { environment: { slug: "development2", sourceSlug: "development" } },
      });
      await runCommand(testCtx, add, "env", "development2");
    });
    it("can add an environment with `add environment`", async () => {
      nockEditResponse({
        operation: CREATE_ENVIRONMENT_MUTATION,
        response: { data: { createEnvironment: { slug: "development2", status: EnvironmentStatus.Active } } },
        expectVariables: { environment: { slug: "development2", sourceSlug: "development" } },
      });
      await runCommand(testCtx, add, "environment", "development2");
    });
  });

  it("throws ArgError for unknown subcommand", async () => {
    const error = await expectError(() => runCommand(testCtx, add, "bogus"));
    expect(error).toBeInstanceOf(ArgError);
    expect(error.message).toMatchInlineSnapshot(`
      "Unknown subcommand bogus

      Did you mean model?

      USAGE
        ggt add <command> [flags]

      Run ggt add -h for more information."
    `);
  });
});
