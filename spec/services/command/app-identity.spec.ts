import fs from "fs-extra";
import { beforeEach, describe, expect, it } from "vitest";

import * as app from "../../../src/services/app/app.js";
import { AppIdentity, AppIdentityArgs, type AppIdentityArgsResult } from "../../../src/services/command/app-identity.js";
import { ArgError } from "../../../src/services/command/arg.js";
import { Commands, type Command } from "../../../src/services/command/command.js";
import { Directory } from "../../../src/services/filesync/directory.js";
import { nockTestApps, testApp, testApp2 } from "../../__support__/app.js";
import { makeArgs } from "../../__support__/arg.js";
import { testCtx } from "../../__support__/context.js";
import { expectError } from "../../__support__/error.js";
import { mockOnce, mockSelectOnce } from "../../__support__/mock.js";
import { expectStdout } from "../../__support__/output.js";
import { testDirPath } from "../../__support__/paths.js";
import { expectProcessExit } from "../../__support__/process.js";
import { loginTestUser } from "../../__support__/user.js";

describe("AppIdentity.load", () => {
  let command: Command;
  let args: AppIdentityArgsResult;
  let localDir: Directory;
  let outputSyncJson: <const State extends app.Application | Record<string, unknown>>(state: State) => Promise<State>;

  beforeEach(async () => {
    loginTestUser();
    nockTestApps();

    command = "dev";
    args = makeArgs(AppIdentityArgs, command, `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`);
    localDir = await Directory.init(testDirPath("local"));

    outputSyncJson = async (state) => {
      await fs.outputJSON(localDir.absolute(".gadget/sync.json"), state);
      return state;
    };
  });

  it("resolves the app and environment from --app and --env args", async () => {
    const appIdentity = await AppIdentity.load(testCtx, {
      command,
      args,
      directory: localDir,
    });

    expect(appIdentity.environment.application.slug).toBe(testApp.slug);
    expect(appIdentity.environment.name).toBe(testApp.environments[0]!.name);
  });

  it("resolves the app and environment from .gadget/sync.json when no args are provided", async () => {
    await outputSyncJson({
      application: testApp.slug,
      environment: "development",
      environments: {
        development: { filesVersion: "1" },
      },
    });

    args = makeArgs(AppIdentityArgs, command);
    const appIdentity = await AppIdentity.load(testCtx, {
      command,
      args,
      directory: localDir,
    });

    expect(appIdentity.environment.application.slug).toBe(testApp.slug);
    expect(appIdentity.environment.name).toBe("development");
  });

  it("prefers --app over .gadget/sync.json state", async () => {
    await outputSyncJson({
      application: testApp.slug,
      environment: "development",
      environments: {
        development: { filesVersion: "1" },
      },
    });

    args = makeArgs(AppIdentityArgs, command, `--app=${testApp2.slug}`, `--env=${testApp2.environments[0]!.name}`);
    const appIdentity = await AppIdentity.load(testCtx, {
      command,
      args,
      directory: localDir,
    });

    expect(appIdentity.environment.application.slug).toBe(testApp2.slug);
  });

  it("prefers --env over .gadget/sync.json state", async () => {
    await outputSyncJson({
      application: testApp.slug,
      environment: "development",
      environments: {
        development: { filesVersion: "1" },
      },
    });

    args = makeArgs(AppIdentityArgs, command, `--env=${testApp.environments[2]!.name}`);
    const appIdentity = await AppIdentity.load(testCtx, {
      command,
      args,
      directory: localDir,
    });

    expect(appIdentity.environment.name).toBe(testApp.environments[2]!.name);
  });

  it("shows apps that the user can select when no --app is provided and no .gadget/sync.json exists", async () => {
    args = makeArgs(AppIdentityArgs, "dev");
    await expectProcessExit(
      async () =>
        await AppIdentity.load(testCtx, {
          command,
          args,
          directory: localDir,
        }),
      1,
    );

    expectStdout().toMatchInlineSnapshot(`
      "Which application do you want to develop?
      [
        [
          "first-test-team",
          [
            "test",
            "test2"
          ]
        ]
      ]

      Aborting because ggt is not running in an interactive terminal.
      "
    `);
  });

  it("shows environments that the user can select when --app is provided but no --env", async () => {
    args = makeArgs(AppIdentityArgs, command, `--app=${testApp.slug}`);
    await expectProcessExit(
      async () =>
        await AppIdentity.load(testCtx, {
          command,
          args,
          directory: localDir,
        }),
      1,
    );

    expectStdout().toMatchInlineSnapshot(`
      "Which environment do you want to develop on?
      [
        "development",
        "cool-environment-development",
        "other-environment-development"
      ]

      Aborting because ggt is not running in an interactive terminal.
      "
    `);
  });

  it("uses the app selected by the user when no --app is provided", async () => {
    args = makeArgs(AppIdentityArgs, command, `--env=${testApp2.environments[0]!.name}`);
    mockSelectOnce(testApp2.slug);

    const appIdentity = await AppIdentity.load(testCtx, {
      command,
      args,
      directory: localDir,
    });

    expect(appIdentity.environment.application.slug).toBe(testApp2.slug);
  });

  it("uses the environment selected by the user when no --env is provided", async () => {
    args = makeArgs(AppIdentityArgs, command, `--app=${testApp.slug}`);
    mockSelectOnce(testApp.environments[2]!.name);

    const appIdentity = await AppIdentity.load(testCtx, {
      command,
      args,
      directory: localDir,
    });

    expect(appIdentity.environment.name).toBe(testApp.environments[2]!.name);
  });

  describe("syncJsonState", () => {
    it("is undefined when no .gadget/sync.json exists", async () => {
      const appIdentity = await AppIdentity.load(testCtx, {
        command,
        args,
        directory: localDir,
      });

      expect(appIdentity.syncJsonState).toBeUndefined();
    });

    it("is undefined when .gadget/sync.json has invalid schema", async () => {
      await fs.outputFile(localDir.absolute(".gadget/sync.json"), '{"foo":"bar"}');

      const appIdentity = await AppIdentity.load(testCtx, {
        command,
        args,
        directory: localDir,
      });

      expect(appIdentity.syncJsonState).toBeUndefined();
    });

    it("is undefined when .gadget/sync.json is not valid JSON", async () => {
      await fs.outputFile(localDir.absolute(".gadget/sync.json"), "not json at all");

      const appIdentity = await AppIdentity.load(testCtx, {
        command,
        args,
        directory: localDir,
      });

      expect(appIdentity.syncJsonState).toBeUndefined();
    });

    it("is parsed correctly from a valid .gadget/sync.json", async () => {
      const state = await outputSyncJson({
        application: testApp.slug,
        environment: "development",
        environments: {
          development: { filesVersion: "5" },
        },
      });

      args = makeArgs(AppIdentityArgs, command);
      const appIdentity = await AppIdentity.load(testCtx, {
        command,
        args,
        directory: localDir,
      });

      expect(appIdentity.syncJsonState).toEqual(state);
    });
  });

  describe("edit client", () => {
    it("is initialized", async () => {
      const appIdentity = await AppIdentity.load(testCtx, {
        command,
        args,
        directory: localDir,
      });

      expect(appIdentity.edit).toBeDefined();
      expect(appIdentity.edit.environment.name).toBe(testApp.environments[0]!.name);
    });
  });

  describe("errors", () => {
    it(`throws ${ArgError.name} when --app is passed a slug that does not exist within the user's list of available apps`, async () => {
      args["--app"] = "does-not-exist";
      const error = await expectError(() =>
        AppIdentity.load(testCtx, {
          command,
          args,
          directory: localDir,
        }),
      );

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`
        "Unknown application:

          does-not-exist

        Did you mean one of these?

          • test
          • test2"
      `);
    });

    it(`throws ${ArgError.name} when .gadget/sync.json references an app that no longer exists`, async () => {
      await outputSyncJson({
        application: "deleted-app",
        environment: "development",
        environments: {
          development: { filesVersion: "1" },
        },
      });

      args = makeArgs(AppIdentityArgs, command);
      const error = await expectError(() =>
        AppIdentity.load(testCtx, {
          command,
          args,
          directory: localDir,
        }),
      );

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatch(/Unknown application/);
      expect(error.message).toMatch(/deleted-app/);
    });

    it(`throws ${ArgError.name} when --env is passed production for a non-allowed command`, async () => {
      args["--env"] = "production";
      const error = await expectError(() =>
        AppIdentity.load(testCtx, {
          command,
          args,
          directory: localDir,
        }),
      );

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`"You cannot "ggt dev" your production environment."`);
    });

    it(`throws ${ArgError.name} when --env is passed an environment that is not in the list of valid environments for the app`, async () => {
      args["--env"] = "does-not-exist";
      const error = await expectError(() =>
        AppIdentity.load(testCtx, {
          command,
          args,
          directory: localDir,
        }),
      );

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

    it(`throws ${ArgError.name} when .gadget/sync.json references an environment that no longer exists`, async () => {
      await outputSyncJson({
        application: testApp.slug,
        environment: "deleted-env",
        environments: {
          "deleted-env": { filesVersion: "1" },
        },
      });

      args = makeArgs(AppIdentityArgs, command);
      const error = await expectError(() =>
        AppIdentity.load(testCtx, {
          command,
          args,
          directory: localDir,
        }),
      );

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatch(/Unknown environment/);
      expect(error.message).toMatch(/deleted-env/);
    });

    it(`throws ${ArgError.name} if the user doesn't have any available apps`, async () => {
      mockOnce(app, "getApplications", () => []);

      const error = await expectError(() =>
        AppIdentity.load(testCtx, {
          command,
          args,
          directory: localDir,
        }),
      );

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`
          "You (test@example.com) don't have have any Gadget applications.

          Visit https://gadget.new to create one!"
      `);
    });
  });

  describe("production environment access", () => {
    const AllowedProdCommands = ["pull", "logs", "eval", "var"] as const;

    it.each(Commands.filter((x) => !AllowedProdCommands.includes(x as any)))(
      'does not allow --env=production when the command is "%s"',
      async (command) => {
        args._ = [command];
        args["--env"] = "production";
        await expect(
          AppIdentity.load(testCtx, {
            command,
            args,
            directory: localDir,
          }),
        ).rejects.toThrowErrorMatchingSnapshot();
      },
    );

    it.each(AllowedProdCommands)('does allow --env=production when the command is "%s"', async (command) => {
      args._ = [command];
      args["--env"] = "production";
      const appIdentity = await AppIdentity.load(testCtx, {
        command,
        args,
        directory: localDir,
      });

      expect(appIdentity.environment.name).toBe("production");
    });

    it("treats production case-insensitively", async () => {
      args["--env"] = "Production";
      const error = await expectError(() =>
        AppIdentity.load(testCtx, {
          command,
          args,
          directory: localDir,
        }),
      );

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatch(/production/);
    });
  });
});
