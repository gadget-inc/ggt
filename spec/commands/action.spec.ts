import fs from "fs-extra";
import { beforeEach, describe, expect, it } from "vitest";

import action from "../../src/commands/action.ts";
import { CREATE_ACTION_MUTATION } from "../../src/services/app/edit/operation.ts";
import { FlagError } from "../../src/services/command/flag.ts";
import { runCommand } from "../../src/services/command/run.ts";
import { nockTestApps } from "../__support__/app.ts";
import { testCtx } from "../__support__/context.ts";
import { expectError } from "../__support__/error.ts";
import { makeFile, makeSyncScenario } from "../__support__/filesync.ts";
import { nockEditResponse } from "../__support__/graphql.ts";
import { loginTestUser } from "../__support__/user.ts";

describe("action", () => {
  beforeEach(async () => {
    loginTestUser();
    nockTestApps();
    await makeSyncScenario();
  });

  describe("add", () => {
    it("can add a global action", async () => {
      nockEditResponse({
        operation: CREATE_ACTION_MUTATION,
        response: { data: { createAction: { remoteFilesVersion: "10", changed: [] } } },
        expectVariables: { path: "sendWelcomeEmail" },
      });

      await runCommand(testCtx, action, "add", "sendWelcomeEmail");
    });

    it("can add a namespaced global action", async () => {
      nockEditResponse({
        operation: CREATE_ACTION_MUTATION,
        response: { data: { createAction: { remoteFilesVersion: "10", changed: [] } } },
        expectVariables: { path: "notifications/sendWelcomeEmail" },
      });

      await runCommand(testCtx, action, "add", "notifications/sendWelcomeEmail");
    });

    it("can add a model action", async () => {
      nockEditResponse({
        operation: CREATE_ACTION_MUTATION,
        response: { data: { createAction: { remoteFilesVersion: "10", changed: [] } } },
        expectVariables: { path: "model/post/publish" },
      });

      await runCommand(testCtx, action, "add", "publish", "--model", "post");
    });

    it("can add a model action on a namespaced model", async () => {
      nockEditResponse({
        operation: CREATE_ACTION_MUTATION,
        response: { data: { createAction: { remoteFilesVersion: "10", changed: [] } } },
        expectVariables: { path: "model/shopify/order/fulfill" },
      });

      await runCommand(testCtx, action, "add", "fulfill", "--model", "shopify/order");
    });

    it("writes returned action files to the local filesystem", async () => {
      const { syncJson } = await makeSyncScenario();

      nockEditResponse({
        operation: CREATE_ACTION_MUTATION,
        response: {
          data: {
            createAction: {
              remoteFilesVersion: "10",
              changed: [makeFile({ path: "api/models/post/actions/publish.js", content: "export const run = async () => {};" })],
            },
          },
        },
        expectVariables: { path: "model/post/publish" },
      });

      await runCommand(testCtx, action, "add", "publish", "--model", "post");

      expect(await fs.pathExists(syncJson.directory.absolute("api/models/post/actions/publish.js"))).toBe(true);
    });

    it("requires an action name", async () => {
      const error = await expectError(() => runCommand(testCtx, action, "add"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.sprint()).toMatchInlineSnapshot(`
        "✘ Missing required argument: name

        USAGE
          ggt action add <name> [flags]

        Run ggt action add -h for more information."
      `);
    });
  });

  it("throws FlagError for unknown subcommand", async () => {
    const error = await expectError(() => runCommand(testCtx, action, "bogus"));
    expect(error).toBeInstanceOf(FlagError);
    expect(error.message).toContain("Unknown subcommand bogus");
  });
});
