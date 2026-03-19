import { beforeEach, describe, expect, it } from "vitest";

import field from "../../src/commands/field.ts";
import { CREATE_MODEL_FIELDS_MUTATION } from "../../src/services/app/edit/operation.ts";
import { FlagError } from "../../src/services/command/flag.ts";
import { runCommand } from "../../src/services/command/run.ts";
import { nockTestApps } from "../__support__/app.ts";
import { testCtx } from "../__support__/context.ts";
import { expectError } from "../__support__/error.ts";
import { makeSyncScenario } from "../__support__/filesync.ts";
import { nockEditResponse } from "../__support__/graphql.ts";
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

    it.each(["user/field", "user/field:", "user/:"])("returns missing field type FlagError if the input is %s", async (partialInput) => {
      const error = await expectError(() => runCommand(testCtx, field, "add", partialInput));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.sprint()).toContain("is not a valid field definition");
    });
  });

  it.each(["remove", "rename", "bogus"])("throws FlagError for unknown subcommand %s", async (subcommand) => {
    const error = await expectError(() => runCommand(testCtx, field, subcommand));
    expect(error).toBeInstanceOf(FlagError);
    expect(error.message).toContain(`Unknown subcommand ${subcommand}`);
  });
});
