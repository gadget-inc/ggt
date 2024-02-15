import nock from "nock";
import open from "open";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nockTestApps, testApp } from "../../spec/__support__/app.js";
import { makeContext } from "../../spec/__support__/context.js";
import { nockEditResponse } from "../../spec/__support__/edit.js";
import { expectError } from "../../spec/__support__/error.js";
import { makeSyncScenario } from "../../spec/__support__/filesync.js";
import { mock } from "../../spec/__support__/mock.js";
import { expectStdout } from "../../spec/__support__/stream.js";
import { loginTestUser, testUser } from "../../spec/__support__/user.js";
import { args, command as openCommand } from "../../src/commands/open.js";
import { GADGET_META_MODELS_QUERY } from "../../src/services/app/edit/operation.js";
import { ArgError } from "../../src/services/command/arg.js";
import type { Context } from "../../src/services/command/context.js";
import { select } from "../../src/services/output/prompt.js";
import * as user from "../../src/services/user/user.js";

describe("open", () => {
  let ctx: Context<typeof args>;

  beforeEach(async () => {
    loginTestUser();
    nockTestApps();

    ctx = makeContext({ parse: args, argv: ["open", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`] });
    await makeSyncScenario({ localFiles: { "file.txt": "test" } });
  });

  afterEach(() => {
    ctx.abort();
    expect(nock.pendingMocks()).toEqual([]);
  });

  describe("opens the browser", () => {
    it("opens a browser to the app's logs viewer", async () => {
      mock(user, "getUser", () => testUser);
      ctx = makeContext({ parse: args, argv: ["open", "logs", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`] });

      await openCommand(ctx);

      expect(open).toHaveBeenCalledWith(`https://${testApp.primaryDomain}/edit/${testApp.environments[0]!.name}/logs`);

      expectStdout().toMatchInlineSnapshot(`
          "Opened log viewer for environment development please check your browser.
          "
        `);
    });

    it("opens a browser to the app's permissions settings page", async () => {
      mock(user, "getUser", () => testUser);
      ctx = makeContext({ parse: args, argv: ["open", "permissions", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`] });

      await openCommand(ctx);

      expect(open).toHaveBeenCalledWith(`https://${testApp.primaryDomain}/edit/${testApp.environments[0]!.name}/settings/permissions`);

      expectStdout().toMatchInlineSnapshot(`
          "Opened permissions settings for environment development please check your browser.
          "
        `);
    });

    it("opens a browser to the app's data page for a specified model", async () => {
      mock(user, "getUser", () => testUser);
      nockGetModels();

      ctx = makeContext({
        parse: args,
        argv: ["open", "data", "modelA", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`],
      });

      await openCommand(ctx);

      expect(open).toHaveBeenCalledWith(`https://${testApp.primaryDomain}/edit/${testApp.environments[0]!.name}/model/modelA/data`);

      expectStdout().toMatchInlineSnapshot(`
          "Opened data viewer for environment development for model modelA please check your browser.
          "
        `);
    });

    it("opens a browser to the app's schema page for a specified model", async () => {
      mock(user, "getUser", () => testUser);
      nockGetModels();

      ctx = makeContext({
        parse: args,
        argv: ["open", "schema", "modelA", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`],
      });

      await openCommand(ctx);

      expect(open).toHaveBeenCalledWith(`https://${testApp.primaryDomain}/edit/${testApp.environments[0]!.name}/model/modelA/schema`);

      expectStdout().toMatchInlineSnapshot(`
          "Opened schema viewer for environment development for model modelA please check your browser.
          "
        `);
    });

    it("to the model's data page based on user selection from a list of available models if --show-all flag is passed", async () => {
      mock(user, "getUser", () => testUser);
      nockGetModels();

      mock(select, () => "user");

      ctx = makeContext({
        parse: args,
        argv: ["open", "data", "--show-all", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`],
      });

      await openCommand(ctx);

      expectStdout().toMatchInlineSnapshot(`
          "Opened data viewer for environment development for model user please check your browser.
          "
        `);
    });

    it("to the model's schema page based on user selection from a list of available models if --show-all flag is passed", async () => {
      mock(user, "getUser", () => testUser);
      nockGetModels();

      mock(select, () => "user");

      ctx = makeContext({
        parse: args,
        argv: ["open", "schema", "--show-all", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`],
      });

      await openCommand(ctx);

      expectStdout().toMatchInlineSnapshot(`
        "Opened schema viewer for environment development for model user please check your browser.
        "
      `);
    });
  });

  it("displays the possible subcommands when one is not passed", async () => {
    const error = await expectError(() => openCommand(ctx));

    expect(error).toBeInstanceOf(ArgError);
    expect(error.message).toMatchInlineSnapshot(`
      "
      Missing subcommand for ggt open [subcommand].
      Run ggt open -help for more information or pass in a subcommand:

        • logs
        • data
        • schema
        • permissions"
    `);
  });

  it("displays the closest match for a model that does not exist", async () => {
    mock(user, "getUser", () => testUser);
    nockGetModels();

    ctx = makeContext({
      parse: args,
      argv: ["open", "data", "use", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`],
    });

    await openCommand(ctx);

    expectStdout().toMatchInlineSnapshot(`
      "      Unknown model use

            Did you mean user?
            
            Run ggt open --help for usage or run command with --show-all to see all available models
      "
    `);
  });
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const nockGetModels = () => {
  return nockEditResponse({
    operation: GADGET_META_MODELS_QUERY,
    overrides: {
      endpoint: "/api/graphql",
    },
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
