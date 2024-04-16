import { beforeEach, describe, expect, it } from "vitest";
import { command as addCommand, args } from "../../src/commands/add.js";
import { GADGET_GLOBAL_ACTIONS_QUERY, GADGET_META_MODELS_QUERY } from "../../src/services/app/api/operation.js";
import {
  CREATE_ACTION_MUTATION,
  CREATE_MODEL_FIELDS_MUTATION,
  CREATE_MODEL_MUTATION,
  CREATE_ROUTE_MUTATION,
} from "../../src/services/app/edit/operation.js";
import { ArgError } from "../../src/services/command/arg.js";
import { makeContext } from "../__support__/context.js";
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

        const ctx = makeContext({ parse: args, argv: ["add", "model", "modelA"] });

        await addCommand(ctx);
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

        const ctx = makeContext({ parse: args, argv: ["add", "model", "modelA", "newField:string", "newField2:boolean"] });

        await addCommand(ctx);
      });

      it("requires a model path", async () => {
        const ctx = makeContext({ parse: args, argv: ["add", "model"] });

        const error = await expectError(() => addCommand(ctx));
        expect(error).toBeInstanceOf(ArgError);
        expect(error.sprint()).toMatchInlineSnapshot(`
          "✘ Failed to add model, missing model path

          Usage
              ggt add model <model_name> [field_name:field_type ...]"
        `);
      });

      it.each(["field;string", "field:", ":", ""])('returns ArgErrors when field argument is "%s"', async (invalidFieldArgument) => {
        const ctx = makeContext({ parse: args, argv: ["add", "model", "newModel", invalidFieldArgument] });

        const error = await expectError(() => addCommand(ctx));
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

        const ctx = makeContext({ parse: args, argv: ["add", "field", "modelA/newField:string"] });

        await addCommand(ctx);
      });

      it("returns an ArgError if there's no input", async () => {
        const ctx = makeContext({ parse: args, argv: ["add", "field"] });

        const error = await expectError(() => addCommand(ctx));
        expect(error).toBeInstanceOf(ArgError);
        expect(error.sprint()).toMatchInlineSnapshot(`
          "✘ Failed to add field, invalid field path definition

          Usage
              ggt add field <model_path>/<field_name>:<field_type>"
        `);
      });

      it.each(["user", "user/"])("returns missing field definition ArgError if the input is %s", async (partialInput) => {
        const ctx = makeContext({ parse: args, argv: ["add", "field", partialInput] });

        const error = await expectError(() => addCommand(ctx));
        expect(error).toBeInstanceOf(ArgError);
        expect(error.sprint()).toContain("Failed to add field, invalid field definition");
      });

      it.each(["user/field", "user/field:", "user/:"])("returns missing field type ArgError if the input is %s", async (partialInput) => {
        const ctx = makeContext({ parse: args, argv: ["add", "field", partialInput] });

        const error = await expectError(() => addCommand(ctx));
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

        const ctx = makeContext({ parse: args, argv: ["add", "action", "actionA"] });

        await addCommand(ctx);
      });

      it("requires an action name/path", async () => {
        const ctx = makeContext({ parse: args, argv: ["add", "action"] });

        const error = await expectError(() => addCommand(ctx));
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

        const ctx = makeContext({ parse: args, argv: ["add", "route", "GET", "routeA"] });

        await addCommand(ctx);
      });

      it("requires a method argument", async () => {
        const ctx = makeContext({ parse: args, argv: ["add", "route"] });

        const error = await expectError(() => addCommand(ctx));
        expect(error).toBeInstanceOf(ArgError);
        expect(error.sprint()).toMatchInlineSnapshot(`
          "✘ Failed to add route, missing route method

          Usage
              ggt add route <HTTP_METHOD> <route_path>"
        `);
      });

      it("requires a route name", async () => {
        const ctx = makeContext({ parse: args, argv: ["add", "route", "GET"] });

        const error = await expectError(() => addCommand(ctx));
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
