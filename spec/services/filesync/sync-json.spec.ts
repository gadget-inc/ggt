/* eslint-disable no-irregular-whitespace */
import fs from "fs-extra";
import terminalLink from "terminal-link";
import { beforeEach, describe, expect, it } from "vitest";
import * as app from "../../../src/services/app/app.js";
import { ArgError } from "../../../src/services/command/arg.js";
import { Commands, type Command } from "../../../src/services/command/command.js";
import { Directory } from "../../../src/services/filesync/directory.js";
import { UnknownDirectoryError } from "../../../src/services/filesync/error.js";
import {
  EphemeralSyncJson,
  SyncJson,
  SyncJsonArgs,
  type AnySyncJsonState,
  type SyncJsonArgsResult,
} from "../../../src/services/filesync/sync-json.js";
import { nockTestApps, testApp, testApp2, testAppWith2Environments } from "../../__support__/app.js";
import { makeArgs } from "../../__support__/arg.js";
import { testCtx } from "../../__support__/context.js";
import { expectError } from "../../__support__/error.js";
import { makeSyncScenario } from "../../__support__/filesync.js";
import { mockOnce } from "../../__support__/mock.js";
import { expectStdout } from "../../__support__/output.js";
import { testDirPath } from "../../__support__/paths.js";
import { expectProcessExit } from "../../__support__/process.js";
import { loginTestUser } from "../../__support__/user.js";

describe("SyncJson.loadOrInit", () => {
  let command: Command;
  let args: SyncJsonArgsResult;
  let localDir: Directory;
  let outputSyncJson: <const State extends AnySyncJsonState>(state: State) => Promise<State>;

  beforeEach(async () => {
    loginTestUser();
    nockTestApps();

    command = "dev";
    args = makeArgs(SyncJsonArgs, command, `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`);
    localDir = await Directory.init(testDirPath("local"));

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

    const syncJson = await SyncJson.loadOrInit(testCtx, { command, args, directory: localDir });

    expect(syncJson.state).toEqual(state);
  });

  it("shows apps that the user can load", async () => {
    args = makeArgs(SyncJsonArgs, "dev");
    await expectProcessExit(async () => await SyncJson.loadOrInit(testCtx, { command, args, directory: localDir }), 1);

    expectStdout().toMatchInlineSnapshot(`
      "Which application do you want to develop?
      [
        [
          "first-test-team",
          [
            "test",
            "test2",
            "test-with-0-environments"
          ]
        ],
        [
          "second-test-team",
          [
            "test-with-2-environments"
          ]
        ]
      ]

      Aborting because ggt is not running in an interactive terminal.
      "
    `);
  });

  it("loads state from .gadget/sync.json (v0.4)", async () => {
    await outputSyncJson({
      app: testApp.slug,
      filesVersion: "77",
      mtime: 1658153625236,
    });

    const syncJson = await SyncJson.loadOrInit(testCtx, { command, args, directory: localDir });

    expect(syncJson.state).toEqual({
      application: testApp.slug,
      environment: "development",
      environments: {
        development: { filesVersion: "77" },
      },
    });
  });

  it("uses default state if .gadget/sync.json does not exist and the directory is empty", async () => {
    const syncJson = await SyncJson.loadOrInit(testCtx, { command, args, directory: localDir });

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

    await expect(SyncJson.loadOrInit(testCtx, { command, args, directory: localDir })).rejects.toThrow(UnknownDirectoryError);
  });

  it(`throws ${UnknownDirectoryError.name} if .gadget/sync.json has invalid json`, async () => {
    await fs.outputFile(localDir.absolute(".gadget/sync.json"), '{"foo":"bar"}');

    await expect(SyncJson.loadOrInit(testCtx, { command, args, directory: localDir })).rejects.toThrow(UnknownDirectoryError);
  });

  it(`does not throw ${UnknownDirectoryError.name} if .gadget/sync.json has invalid json and --allow-unknown-directory is passed`, async () => {
    await fs.outputFile(localDir.absolute(".gadget/sync.json"), '{"foo":"bar"}');

    args["--allow-unknown-directory"] = true;
    const syncJson = await SyncJson.loadOrInit(testCtx, { command, args, directory: localDir });

    expect(syncJson.state).toEqual({
      application: testApp.slug,
      environment: testApp.environments[0]!.name,
      environments: {
        development: { filesVersion: "0" },
      },
    });
  });

  it(`throws ${ArgError.name} when --app is passed a slug that does not exist within the user's list of available apps`, async () => {
    args["--app"] = "does-not-exist";
    const error = await expectError(() => SyncJson.loadOrInit(testCtx, { command, args, directory: localDir }));

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
    args["--env"] = "production";
    const error = await expectError(() => SyncJson.loadOrInit(testCtx, { command, args, directory: localDir }));

    expect(error).toBeInstanceOf(ArgError);
    // eslint-disable-next-line quotes
    expect(error.message).toMatchInlineSnapshot(`"You cannot "ggt dev" your production environment."`);
  });

  it(`throws ${ArgError.name} when --env is passed an environment that is not in the list of valid environments for the app`, async () => {
    args["--env"] = "does-not-exist";
    const error = await expectError(() => SyncJson.loadOrInit(testCtx, { command, args, directory: localDir }));

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
    mockOnce(app, "getApplications", () => []);

    const error = await expectError(() => SyncJson.loadOrInit(testCtx, { command, args, directory: localDir }));

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

    const error = await expectError(() => SyncJson.loadOrInit(testCtx, { command, args, directory: localDir }));

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

    args["--app"] = testApp2.slug;
    args["--allow-different-app"] = true;
    const syncJson = await SyncJson.loadOrInit(testCtx, { command, args, directory: localDir });

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

    args["--env"] = testApp.environments[2]!.name;
    const syncJson = await SyncJson.loadOrInit(testCtx, { command, args, directory: localDir });

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

    args["--env"] = testApp.environments[3]!.name;
    const syncJson = await SyncJson.loadOrInit(testCtx, { command, args, directory: localDir });

    expect(syncJson.state).toEqual({
      ...initialState,
      environment: testApp.environments[3]!.name,
      environments: {
        ...initialState.environments,
        [testApp.environments[3]!.name]: { filesVersion: "0" },
      },
    });
  });

  it.each(Commands.filter((x) => x !== "pull"))('does not allow --env=production when the command is "%s"', async (command) => {
    args._ = [command];
    args["--env"] = "production";
    await expect(SyncJson.loadOrInit(testCtx, { command, args, directory: localDir })).rejects.toThrowErrorMatchingSnapshot();
  });

  it('does allow --env=production when the command is "pull"', async () => {
    command = "pull";
    args._ = [command];
    args["--env"] = "production";
    const syncJson = await SyncJson.loadOrInit(testCtx, { command, args, directory: localDir });

    expect(syncJson.state).toEqual({
      application: testApp.slug,
      environment: "production",
      environments: {
        production: { filesVersion: "0" },
      },
    });
  });

  it("returns ephemeral sync json when --env=production", async () => {
    command = "pull";
    args._ = [command];
    const devSyncJson = await SyncJson.loadOrInit(testCtx, { command, args, directory: localDir });
    expect(devSyncJson).not.toBeInstanceOf(EphemeralSyncJson);

    args["--env"] = "production";
    const prodSyncJson = await SyncJson.loadOrInit(testCtx, { command, args, directory: localDir });
    expect(prodSyncJson).toBeInstanceOf(EphemeralSyncJson);
  });
});

describe("sprintSyncJson", () => {
  let syncJson: SyncJson;

  beforeEach(async () => {
    loginTestUser();
    nockTestApps();

    ({ syncJson } = await makeSyncScenario());
  });

  it("produces the expected output when terminalLink.isSupported = true", () => {
    mockOnce(terminalLink, "isSupported", "get", () => true);
    expect(syncJson.sprint()).toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch

      Preview (​https://test--development.ggt.pub​)  Editor (​https://test.gadget.app/edit/development​)  Playground (​https://test.gadget.app/api/playground/javascript?environment=development​)  Docs (​https://docs.gadget.dev/api/test​)
      "
    `);
  });

  it("produces the expected output when terminalLink.isSupported = false", () => {
    expect(syncJson.sprint()).toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.ggt.pub
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/javascript?environment=development
       Docs        https://docs.gadget.dev/api/test
      "
    `);
  });
});
