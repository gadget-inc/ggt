import { beforeEach, describe, expect, it } from "vitest";

import field from "../../src/commands/field.ts";
import {
  CREATE_MODEL_FIELDS_MUTATION,
  REMOVE_MODEL_FIELD_MUTATION,
  RENAME_MODEL_FIELD_MUTATION,
} from "../../src/services/app/edit/operation.ts";
import { FlagError } from "../../src/services/command/flag.ts";
import { runCommand } from "../../src/services/command/run.ts";
import { confirm } from "../../src/services/output/confirm.ts";
import { nockTestApps } from "../__support__/app.ts";
import { testCtx } from "../__support__/context.ts";
import { expectError } from "../__support__/error.ts";
import { makeSyncScenario } from "../__support__/filesync.ts";
import { nockEditResponse } from "../__support__/graphql.ts";
import { mockConfirmOnce } from "../__support__/mock.ts";
import { loginTestUser } from "../__support__/user.ts";

describe("field", () => {
  beforeEach(async () => {
    loginTestUser();
    nockTestApps();
    await makeSyncScenario();
  });

  describe("add", () => {
    it("can add a model field", async () => {
      nockEditResponse({
        operation: CREATE_MODEL_FIELDS_MUTATION,
        response: { data: { createModelFields: { remoteFilesVersion: "10", changed: [] } } },
        expectVariables: {
          path: "post",
          fields: [{ name: "title", fieldType: "string" }],
        },
      });

      await runCommand(testCtx, field, "add", "post/title:string");
    });

    it("can add a field on a namespaced model", async () => {
      nockEditResponse({
        operation: CREATE_MODEL_FIELDS_MUTATION,
        response: { data: { createModelFields: { remoteFilesVersion: "10", changed: [] } } },
        expectVariables: {
          path: "mystore/order",
          fields: [{ name: "note", fieldType: "string" }],
        },
      });

      await runCommand(testCtx, field, "add", "mystore/order/note:string");
    });

    it("returns FlagError if there is no input", async () => {
      const error = await expectError(() => runCommand(testCtx, field, "add"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.usageHint).toBe(true);
      expect(error.sprint()).toMatchInlineSnapshot(`
        "✘ Missing required argument: model/field:type

        USAGE
          ggt field add <model/field:type> [flags]

        Run ggt field add -h for more information."
      `);
    });

    it.each(["user", "user/"])("returns missing field definition FlagError if the input is %s", async (partialInput) => {
      const error = await expectError(() => runCommand(testCtx, field, "add", partialInput));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.sprint()).toContain("Failed to add field, invalid field definition");
    });

    it("returns missing field type FlagError if the input is user/field", async () => {
      const error = await expectError(() => runCommand(testCtx, field, "add", "user/field"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.sprint()).toContain("invalid field definition");
    });

    it.each(["user/field:", "user/:"])("returns missing field type FlagError if the input is %s", async (partialInput) => {
      const error = await expectError(() => runCommand(testCtx, field, "add", partialInput));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.sprint()).toContain("is not a valid field definition");
    });
  });

  describe("remove", () => {
    it("removes a field with confirmation", async () => {
      mockConfirmOnce();

      nockEditResponse({
        operation: REMOVE_MODEL_FIELD_MUTATION,
        response: { data: { removeModelField: { remoteFilesVersion: "10", changed: [], deleted: [] } } },
        expectVariables: { path: "post", field: "title" },
      });

      await runCommand(testCtx, field, "remove", "post/title");

      expect(confirm).toHaveBeenCalledOnce();
    });

    it("removes a field with --force", async () => {
      nockEditResponse({
        operation: REMOVE_MODEL_FIELD_MUTATION,
        response: { data: { removeModelField: { remoteFilesVersion: "10", changed: [], deleted: [] } } },
        expectVariables: { path: "post", field: "title" },
      });

      await runCommand(testCtx, field, "remove", "post/title", "--force");

      expect(confirm).not.toHaveBeenCalled();
    });

    it("removes a field on a namespaced model", async () => {
      nockEditResponse({
        operation: REMOVE_MODEL_FIELD_MUTATION,
        response: { data: { removeModelField: { remoteFilesVersion: "10", changed: [], deleted: [] } } },
        expectVariables: { path: "mystore/order", field: "note" },
      });

      await runCommand(testCtx, field, "remove", "mystore/order/note", "--force");
    });

    it("returns FlagError if there is no input", async () => {
      const error = await expectError(() => runCommand(testCtx, field, "remove"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.usageHint).toBe(true);
      expect(error.sprint()).toContain("Missing required argument: model/field");
    });

    it.each(["post", "post/"])("returns FlagError for invalid field path %s", async (input) => {
      const error = await expectError(() => runCommand(testCtx, field, "remove", input));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.sprint()).toContain("Missing field definition");
    });
  });

  describe("rename", () => {
    it("renames a field", async () => {
      nockEditResponse({
        operation: RENAME_MODEL_FIELD_MUTATION,
        response: { data: { renameModelField: { remoteFilesVersion: "10", changed: [], deleted: [] } } },
        expectVariables: { path: "post", field: "title", newName: "heading" },
      });

      await runCommand(testCtx, field, "rename", "post/title", "post/heading");
    });

    it("renames a field on a namespaced model", async () => {
      nockEditResponse({
        operation: RENAME_MODEL_FIELD_MUTATION,
        response: { data: { renameModelField: { remoteFilesVersion: "10", changed: [], deleted: [] } } },
        expectVariables: { path: "shopify/order", field: "note", newName: "internalNote" },
      });

      await runCommand(testCtx, field, "rename", "shopify/order/note", "shopify/order/internalNote");
    });

    it("errors when model paths differ", async () => {
      const error = await expectError(() => runCommand(testCtx, field, "rename", "post/title", "article/heading"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.sprint()).toContain("Both paths must reference the same model");
    });

    it("errors when field name is the same", async () => {
      const error = await expectError(() => runCommand(testCtx, field, "rename", "post/title", "post/title"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.sprint()).toContain("New field name must be different");
    });

    it("returns FlagError if there is no input", async () => {
      const error = await expectError(() => runCommand(testCtx, field, "rename", "post/title"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.usageHint).toBe(true);
      expect(error.sprint()).toContain("Missing required argument: model/new-field-name");
    });

    it.each(["post", "post/"])("returns FlagError for invalid source field path %s", async (input) => {
      const error = await expectError(() => runCommand(testCtx, field, "rename", input, "post/heading"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.sprint()).toContain("Missing field definition");
    });

    it.each(["post", "post/"])("returns FlagError for invalid target field path %s", async (input) => {
      const error = await expectError(() => runCommand(testCtx, field, "rename", "post/title", input));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.sprint()).toContain("Missing field definition");
    });
  });
});
