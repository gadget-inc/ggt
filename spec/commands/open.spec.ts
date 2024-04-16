import open from "open";
import { beforeEach, describe, expect, it } from "vitest";
import { testApp, testEnvironment } from "../../spec/__support__/app.js";
import { makeContext } from "../../spec/__support__/context.js";
import { makeSyncScenario } from "../../spec/__support__/filesync.js";
import { mockSelectOnce } from "../../spec/__support__/mock.js";
import { args, command as openCommand } from "../../src/commands/open.js";
import { GADGET_META_MODELS_QUERY } from "../../src/services/app/api/operation.js";
import { ArgError } from "../../src/services/command/arg.js";
import { expectError } from "../__support__/error.js";
import { nockApiResponse } from "../__support__/graphql.js";
import { expectStdout } from "../__support__/output.js";
import { describeWithAuth } from "../utils.js";

describe("open", () => {
  describeWithAuth(() => {
    beforeEach(async () => {
      await makeSyncScenario();
    });

    it("opens a browser to the app's editor", async () => {
      const ctx = makeContext({ parse: args, argv: ["open", `--app=${testApp.slug}`, `--env=${testEnvironment.name}`] });

      await openCommand(ctx);

      expect(open).toHaveBeenCalledWith(`https://${testApp.primaryDomain}/edit/${testEnvironment.name}`);

      expectStdout().toMatchInlineSnapshot(`
        "Opened editor for environment development.
        "
      `);
    });

    it("opens a browser to the app's logs viewer", async () => {
      const ctx = makeContext({ parse: args, argv: ["open", "logs", `--app=${testApp.slug}`, `--env=${testEnvironment.name}`] });

      await openCommand(ctx);

      expect(open).toHaveBeenCalledWith(`https://${testApp.primaryDomain}/edit/${testEnvironment.name}/logs`);

      expectStdout().toMatchInlineSnapshot(`
        "Opened log viewer for environment development.
        "
      `);
    });

    it("opens a browser to the app's permissions settings page", async () => {
      const ctx = makeContext({
        parse: args,
        argv: ["open", "permissions", `--app=${testApp.slug}`, `--env=${testEnvironment.name}`],
      });

      await openCommand(ctx);

      expect(open).toHaveBeenCalledWith(`https://${testApp.primaryDomain}/edit/${testEnvironment.name}/settings/permissions`);

      expectStdout().toMatchInlineSnapshot(`
        "Opened permissions settings for environment development.
        "
      `);
    });

    it("opens a browser to the app's data page for a specified model", async () => {
      nockGetModels();

      const ctx = makeContext({ parse: args, argv: ["open", "data", "modelA", `--app=${testApp.slug}`, `--env=${testEnvironment.name}`] });

      await openCommand(ctx);

      expect(open).toHaveBeenCalledWith(`https://${testApp.primaryDomain}/edit/${testEnvironment.name}/model/modelA/data`);

      expectStdout().toMatchInlineSnapshot(`
        "Opened data viewer for environment development for model modelA.
        "
      `);
    });

    it("opens a browser to the app's schema page for a specified model", async () => {
      nockGetModels();

      const ctx = makeContext({
        parse: args,
        argv: ["open", "schema", "modelA", `--app=${testApp.slug}`, `--env=${testEnvironment.name}`],
      });

      await openCommand(ctx);

      expect(open).toHaveBeenCalledWith(`https://${testApp.primaryDomain}/edit/${testEnvironment.name}/model/modelA/schema`);

      expectStdout().toMatchInlineSnapshot(`
        "Opened schema viewer for environment development for model modelA.
        "
      `);
    });

    it("to the model's data page based on user selection from a list of available models if --show-all flag is passed", async () => {
      const ctx = makeContext({
        parse: args,
        argv: ["open", "data", "--show-all", `--app=${testApp.slug}`, `--env=${testEnvironment.name}`],
      });

      nockGetModels();
      mockSelectOnce("user");

      await openCommand(ctx);

      expectStdout().toMatchInlineSnapshot(`
        "Opened data viewer for environment development for model user.
        "
      `);
    });

    it("to the model's schema page based on user selection from a list of available models if --show-all flag is passed", async () => {
      const ctx = makeContext({
        parse: args,
        argv: ["open", "schema", "--show-all", `--app=${testApp.slug}`, `--env=${testEnvironment.name}`],
      });

      nockGetModels();
      mockSelectOnce("user");

      await openCommand(ctx);

      expectStdout().toMatchInlineSnapshot(`
        "Opened schema viewer for environment development for model user.
        "
      `);
    });

    it("displays the closest match for a model that does not exist", async () => {
      const ctx = makeContext({
        parse: args,
        argv: ["open", "data", "use", `--app=${testApp.slug}`, `--env=${testEnvironment.name}`],
      });

      nockGetModels();

      const error: ArgError = await expectError(() => openCommand(ctx));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.sprint()).toMatchInlineSnapshot(`
        "✘ Unknown model use

        Did you mean user?

        Run with "--show-all" to choose from available models.

          ggt open data --show-all"
      `);
    });
  });
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
