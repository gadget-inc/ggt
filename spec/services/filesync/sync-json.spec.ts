import fs from "fs-extra";
import { beforeEach, describe, expect, it } from "vitest";
import * as app from "../../../src/services/app/app.js";
import { ArgError } from "../../../src/services/command/arg.js";
import type { Context } from "../../../src/services/command/context.js";
import { Directory } from "../../../src/services/filesync/directory.js";
import { UnknownDirectoryError } from "../../../src/services/filesync/error.js";
import { SyncJson, SyncJsonArgs, type AnySyncJsonState, type SyncJsonStateV05 } from "../../../src/services/filesync/sync-json.js";
import { nockTestApps, testApp, testApp2, testAppWith2Environments } from "../../__support__/app.js";
import { makeContext } from "../../__support__/context.js";
import { expectError } from "../../__support__/error.js";
import { mockOnce } from "../../__support__/mock.js";
import { testDirPath } from "../../__support__/paths.js";
import { loginTestUser } from "../../__support__/user.js";

describe("SyncJson.loadOrInit", () => {
  let localDir: Directory;
  let ctx: Context<SyncJsonArgs>;
  let outputSyncJson: <const State extends AnySyncJsonState>(state: State) => Promise<State>;

  beforeEach(async () => {
    loginTestUser();
    nockTestApps();

    localDir = await Directory.init(testDirPath("local"));
    ctx = makeContext({ parse: SyncJsonArgs, argv: ["dev", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`] });

    outputSyncJson = async (state) => {
      await fs.outputJSON(localDir.absolute(".gadget/sync.json"), state);
      return state;
    };
  });

  it("loads state from .gadget/sync.json (latest)", async () => {
    const state = await outputSyncJson({
      application: testApp.slug,
      environment: "development",
      environments: {
        development: { filesVersion: "1" },
      },
    });

    const syncJson = await SyncJson.loadOrInit(ctx, { directory: localDir });

    expect(syncJson.state).toEqual(state);
  });

  it("loads state from .gadget/sync.json (v0.4)", async () => {
    await outputSyncJson({
      app: testApp.slug,
      filesVersion: "77",
      mtime: 1658153625236,
    });

    const syncJson = await SyncJson.loadOrInit(ctx, { directory: localDir });

    expect(syncJson.state).toEqual({
      application: testApp.slug,
      environment: "development",
      environments: {
        development: { filesVersion: "77" },
      },
    } as SyncJsonStateV05);
  });

  it("uses default state if .gadget/sync.json does not exist and the directory is empty", async () => {
    const syncJson = await SyncJson.loadOrInit(ctx, { directory: localDir });

    expect(syncJson.state).toEqual({
      application: testApp.slug,
      environment: testApp.environments[0]!.name,
      environments: {
        development: { filesVersion: "0" },
      },
    });
  });

  it(`throws ${UnknownDirectoryError.name} if .gadget/sync.json does not exist and the directory is not empty`, async () => {
    await fs.outputFile(localDir.absolute("foo.js"), "// foo");

    await expect(SyncJson.loadOrInit(ctx, { directory: localDir })).rejects.toThrow(UnknownDirectoryError);
  });

  it(`throws ${UnknownDirectoryError.name} if .gadget/sync.json has invalid json`, async () => {
    await fs.outputFile(localDir.absolute(".gadget/sync.json"), '{"foo":"bar"}');

    await expect(SyncJson.loadOrInit(ctx, { directory: localDir })).rejects.toThrow(UnknownDirectoryError);
  });

  it(`does not throw ${UnknownDirectoryError.name} if .gadget/sync.json has invalid json and --allow-unknown-directory is passed`, async () => {
    await fs.outputFile(localDir.absolute(".gadget/sync.json"), '{"foo":"bar"}');

    ctx = ctx.child({ overwrite: { "--allow-unknown-directory": true } });
    const syncJson = await SyncJson.loadOrInit(ctx, { directory: localDir });

    expect(syncJson.state).toEqual({
      application: testApp.slug,
      environment: testApp.environments[0]!.name,
      environments: {
        development: { filesVersion: "0" },
      },
    });
  });

  it(`throws ${ArgError.name} when --app is passed a slug that does not exist within the user's list of available apps`, async () => {
    ctx = ctx.child({ overwrite: { "--app": "does-not-exist" } });
    const error = await expectError(() => SyncJson.loadOrInit(ctx, { directory: localDir }));

    expect(error).toBeInstanceOf(ArgError);
    expect(error.message).toMatchInlineSnapshot(`
      "Unknown application:

        does-not-exist

      Did you mean one of these?

        • test
        • test2
        • test-with-2-environments
        • test-with-0-environments"
    `);
  });

  it(`throws ${ArgError.name} when --env is passed production`, async () => {
    ctx = ctx.child({ overwrite: { "--env": "production" } });
    const error = await expectError(() => SyncJson.loadOrInit(ctx, { directory: localDir }));

    expect(error).toBeInstanceOf(ArgError);
    expect(error.message).toMatchInlineSnapshot(`
      "Unknown environment:

        production

      Did you mean one of these?

        • development
        • cool-environment-development
        • other-environment-development"
    `);
  });

  it(`throws ${ArgError.name} when --env is passed an environment that is not in the list of valid environments for the app`, async () => {
    ctx = ctx.child({ overwrite: { "--env": "does-not-exist" } });
    const error = await expectError(() => SyncJson.loadOrInit(ctx, { directory: localDir }));

    expect(error).toBeInstanceOf(ArgError);
    expect(error.message).toMatchInlineSnapshot(`
      "Unknown environment:

        does-not-exist

      Did you mean one of these?

        • development
        • cool-environment-development
        • other-environment-development"
    `);
  });

  it(`throws ${ArgError.name} if the user doesn't have any available apps`, async () => {
    mockOnce(app, "getApps", () => []);

    const error = await expectError(() => SyncJson.loadOrInit(ctx, { directory: localDir }));

    expect(error).toBeInstanceOf(ArgError);
    expect(error.message).toMatchInlineSnapshot(`
        "You (test@example.com) don't have have any Gadget applications.

        Visit https://gadget.new to create one!"
    `);
  });

  it(`throws ${ArgError.name} when --app is passed a different slug than the one in .gadget/sync.json`, async () => {
    await outputSyncJson({
      application: testAppWith2Environments.slug,
      environment: testAppWith2Environments.environments[0]!.name,
      environments: {
        development: { filesVersion: "1" },
      },
    });

    const error = await expectError(() => SyncJson.loadOrInit(ctx, { directory: localDir }));

    expect(error).toBeInstanceOf(ArgError);
    expect(error.message).toMatch(/^You were about to sync the following app to the following directory:/);
  });

  it(`does not throw ${ArgError.name} when --app is passed a different app name than the one in .gadget/sync.json and --allow-different-app is passed`, async () => {
    await outputSyncJson({
      application: testApp.slug,
      environment: testApp.environments[0]!.name,
      environments: {
        [testApp.environments[0]!.name]: { filesVersion: "1" },
      },
    });

    ctx = ctx.child({ overwrite: { "--app": testApp2.slug, "--allow-different-app": true } });
    const syncJson = await SyncJson.loadOrInit(ctx, { directory: localDir });

    expect(syncJson.state).toEqual({
      application: testApp2.slug,
      environment: testApp2.environments[0]!.name,
      environments: {
        [testApp2.environments[0]!.name]: { filesVersion: "0" },
      },
    });
  });

  it(`does not throw ${ArgError.name} when --env is passed a different environment than the one in .gadget/sync.json`, async () => {
    await outputSyncJson({
      application: testApp.slug,
      environment: testApp.environments[0]!.name,
      environments: {
        development: { filesVersion: "1" },
      },
    });

    ctx = ctx.child({ overwrite: { "--env": testApp.environments[2]!.name } });
    const syncJson = await SyncJson.loadOrInit(ctx, { directory: localDir });

    expect(syncJson.state).toEqual({
      application: testApp.slug,
      environment: testApp.environments[2]!.name,
      environments: {
        development: { filesVersion: "1" },
        [testApp.environments[2]!.name]: { filesVersion: "0" },
      },
    });
  });

  it("retains environments state when --env flag is passed", async () => {
    const initialState = await outputSyncJson({
      application: testApp.slug,
      environment: testApp.environments[0]!.name,
      environments: {
        [testApp.environments[0]!.name]: { filesVersion: "10" },
        [testApp.environments[2]!.name]: { filesVersion: "14" },
      },
    });

    ctx = ctx.child({ overwrite: { "--env": testApp.environments[3]!.name } });
    const syncJson = await SyncJson.loadOrInit(ctx, { directory: localDir });

    expect(syncJson.state).toEqual({
      ...initialState,
      environment: testApp.environments[3]!.name,
      environments: {
        ...initialState.environments,
        [testApp.environments[3]!.name]: { filesVersion: "0" },
      },
    });
  });
});
