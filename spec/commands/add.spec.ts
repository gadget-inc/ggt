import { beforeEach, describe, expect, it } from "vitest";
import * as add from "../../src/commands/add.js";
import { GADGET_GLOBAL_ACTIONS_QUERY, GADGET_META_MODELS_QUERY } from "../../src/services/app/api/operation.js";
import {
  CREATE_ACTION_MUTATION,
  CREATE_MODEL_FIELDS_MUTATION,
  CREATE_MODEL_MUTATION,
  CREATE_ROUTE_MUTATION,
} from "../../src/services/app/edit/operation.js";
import { ArgError } from "../../src/services/command/arg.js";
import { makeArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { expectError } from "../__support__/error.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { nockApiResponse, nockEditResponse } from "../__support__/graphql.js";
import { describeWithAuth } from "../utils.js";

describe("add", () => {
  describeWithAuth(() => {
    beforeEach(async () => {
      await makeSyncScenario();
    });

    describe("models", () => {
      it("can add a model", async () => {
        nockEditResponse({
          operation: CREATE_MODEL_MUTATION,
          response: { data: { createModel: { remoteFilesVersion: "10", changed: [] } } },
          expectVariables: { path: "modelA", fields: [] },
        });

        await add.run(testCtx, makeArgs(add.args, "add", "model", "modelA"));
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

        await add.run(testCtx, makeArgs(add.args, "add", "model", "modelA", "newField:string", "newField2:boolean"));
      });

      it("requires a model path", async () => {
        const error = await expectError(() => add.run(testCtx, makeArgs(add.args, "add", "model")));
        expect(error).toBeInstanceOf(ArgError);
        expect(error.sprint()).toMatchInlineSnapshot(`
          "✘ Failed to add model, missing model path

          Usage
              ggt add model <model_name> [field_name:field_type ...]"
        `);
      });

      it.each(["field;string", "field:", ":", ""])('returns ArgErrors when field argument is "%s"', async (invalidFieldArgument) => {
        const error = await expectError(() => add.run(testCtx, makeArgs(add.args, "add", "model", "modelA", invalidFieldArgument)));
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

        await add.run(testCtx, makeArgs(add.args, "add", "field", "modelA/newField:string"));
      });

      it("returns an ArgError if there's no input", async () => {
        const error = await expectError(() => add.run(testCtx, makeArgs(add.args, "add", "field")));
        expect(error).toBeInstanceOf(ArgError);
        expect(error.sprint()).toMatchInlineSnapshot(`
          "✘ Failed to add field, invalid field path definition

          Usage
              ggt add field <model_path>/<field_name>:<field_type>"
        `);
      });

      it.each(["user", "user/"])("returns missing field definition ArgError if the input is %s", async (partialInput) => {
        const error = await expectError(() => add.run(testCtx, makeArgs(add.args, "add", "field", partialInput)));
        expect(error).toBeInstanceOf(ArgError);
        expect(error.sprint()).toContain("Failed to add field, invalid field definition");
      });

      it.each(["user/field", "user/field:", "user/:"])("returns missing field type ArgError if the input is %s", async (partialInput) => {
        const error = await expectError(() => add.run(testCtx, makeArgs(add.args, "add", "field", partialInput)));
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

        await add.run(testCtx, makeArgs(add.args, "add", "action", "actionA"));
      });

      it("requires an action name/path", async () => {
        const error = await expectError(() => add.run(testCtx, makeArgs(add.args, "add", "action")));
        expect(error).toBeInstanceOf(ArgError);
        expect(error.sprint()).toMatchInlineSnapshot(`
          "✘ Failed to add action, missing action path

          Usage
              ggt add action [CONTEXT]/<action_name>
              CONTEXT:Specifies the kind of action. Use "model" for model actions otherwise use "action"."
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

        await add.run(testCtx, makeArgs(add.args, "add", "route", "GET", "routeA"));
      });

      it("requires a method argument", async () => {
        const error = await expectError(() => add.run(testCtx, makeArgs(add.args, "add", "route")));
        expect(error).toBeInstanceOf(ArgError);
        expect(error.sprint()).toMatchInlineSnapshot(`
          "✘ Failed to add route, missing route method

          Usage
              ggt add route <HTTP_METHOD> <route_path>"
        `);
      });

      it("requires a route name", async () => {
        const error = await expectError(() => add.run(testCtx, makeArgs(add.args, "add", "route", "GET")));
        expect(error).toBeInstanceOf(ArgError);
        expect(error.sprint()).toMatchInlineSnapshot(`
          "✘ Failed to add route, missing route path

          Usage
              ggt add route GET <route_path>"
        `);
      });
    });
  });
});
