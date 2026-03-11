import { default as openApp } from "open";
import { beforeEach, describe, expect, it } from "vitest";

import open from "../../src/commands/open.js";
import { GADGET_META_MODELS_QUERY } from "../../src/services/app/api/operation.js";
import { FlagError } from "../../src/services/command/flag.js";
import { runCommand } from "../../src/services/command/run.js";
import { nockTestApps, testApp, testEnvironment } from "../__support__/app.js";
import { testCtx } from "../__support__/context.js";
import { expectError } from "../__support__/error.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { nockApiResponse } from "../__support__/graphql.js";
import { mockSelectOnce } from "../__support__/mock.js";
import { expectStdout } from "../__support__/output.js";
import { loginTestUser } from "../__support__/user.js";

describe("open", () => {
  beforeEach(async () => {
    loginTestUser();
    nockTestApps();
    await makeSyncScenario();
  });

  it("opens a browser to the app's editor", async () => {
    await runCommand(testCtx, open);

    expect(openApp).toHaveBeenCalledWith(`https://${testApp.primaryDomain}/edit/${testEnvironment.name}`);

    expectStdout().toMatchInlineSnapshot(`
        "Opened editor for environment development.
        "
      `);
  });

  it("opens a browser to the app's logs viewer", async () => {
    await runCommand(testCtx, open, "logs");

    expect(openApp).toHaveBeenCalledWith(`https://${testApp.primaryDomain}/edit/${testEnvironment.name}/logs`);

    expectStdout().toMatchInlineSnapshot(`
        "Opened log viewer for environment development.
        "
      `);
  });

  it("opens a browser to the app's permissions settings page", async () => {
    await runCommand(testCtx, open, "permissions");

    expect(openApp).toHaveBeenCalledWith(`https://${testApp.primaryDomain}/edit/${testEnvironment.name}/settings/permissions`);

    expectStdout().toMatchInlineSnapshot(`
        "Opened permissions settings for environment development.
        "
      `);
  });

  it("opens a browser to the app's data page for a specified model", async () => {
    nockGetModels();

    await runCommand(testCtx, open, "data", "modelA");

    expect(openApp).toHaveBeenCalledWith(`https://${testApp.primaryDomain}/edit/${testEnvironment.name}/model/modelA/data`);

    expectStdout().toMatchInlineSnapshot(`
        "Opened data viewer for environment development for model modelA.
        "
      `);
  });

  it("opens a browser to the app's schema page for a specified model", async () => {
    nockGetModels();

    await runCommand(testCtx, open, "schema", "modelA");

    expect(openApp).toHaveBeenCalledWith(`https://${testApp.primaryDomain}/edit/${testEnvironment.name}/model/modelA/schema`);

    expectStdout().toMatchInlineSnapshot(`
        "Opened schema viewer for environment development for model modelA.
        "
      `);
  });

  it("to the model's data page based on user selection from a list of available models if --show-all flag is passed", async () => {
    nockGetModels();
    mockSelectOnce("user");

    await runCommand(testCtx, open, "data", "--show-all");

    expectStdout().toMatchInlineSnapshot(`
        "Opened data viewer for environment development for model user.
        "
      `);
  });

  it("to the model's schema page based on user selection from a list of available models if --show-all flag is passed", async () => {
    nockGetModels();
    mockSelectOnce("user");

    await runCommand(testCtx, open, "schema", "--show-all");

    expectStdout().toMatchInlineSnapshot(`
        "Opened schema viewer for environment development for model user.
        "
      `);
  });

  it("throws FlagError with closest match suggestion for unknown location", async () => {
    const error: FlagError = await expectError(() => runCommand(testCtx, open, "ogs"));
    expect(error).toBeInstanceOf(FlagError);
    expect(error.sprint()).toMatchInlineSnapshot(`
      "✘ Unknown location ogs

      Did you mean logs?

      USAGE
        ggt open [location] [model] [flags]

      Run ggt open -h for more information."
    `);
  });

  it("displays the closest match for a model that does not exist", async () => {
    nockGetModels();

    const error: FlagError = await expectError(() => runCommand(testCtx, open, "data", "use"));
    expect(error).toBeInstanceOf(FlagError);
    expect(error.sprint()).toMatchInlineSnapshot(`
        "✘ Unknown model use

        Did you mean user?

        Run with "--show-all" to choose from available models.

          ggt open data --show-all"
      `);
  });
});

export const nockGetModels = () => {
  return nockApiResponse({
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
  });
};
