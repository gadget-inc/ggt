import fs from "fs-extra";
import nock from "nock";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EnvironmentStatus } from "../../src/__generated__/graphql.js";
import * as env from "../../src/commands/env.js";
import {
  CREATE_ENVIRONMENT_MUTATION,
  DELETE_ENVIRONMENT_MUTATION,
  UNPAUSE_ENVIRONMENT_MUTATION,
} from "../../src/services/app/edit/operation.js";
import { ArgError } from "../../src/services/command/arg.js";
import { config } from "../../src/services/config/config.js";
import { confirm } from "../../src/services/output/confirm.js";
import { nockTestApps, testApp, testApp2 } from "../__support__/app.js";
import { makeArgsWithOptions } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { expectError } from "../__support__/error.js";
import { nockEditResponse } from "../__support__/graphql.js";
import { mockConfirmOnce } from "../__support__/mock.js";
import { expectStdout } from "../__support__/output.js";
import { testDirPath } from "../__support__/paths.js";
import { expectProcessExit } from "../__support__/process.js";
import { loginTestUser, loginTestUserWithToken, matchAuthHeader } from "../__support__/user.js";

const makeEnvArgs = (...argv: string[]) => {
  return makeArgsWithOptions(env.args, env.parseOptions, "env", ...argv);
};

describe("env", () => {
  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  describe("list", () => {
    it("lists environments with name and type", async () => {
      await env.run(testCtx, makeEnvArgs("list", "--app=test"));

      expectStdout().toContain("development");
      expectStdout().toContain("production");
    });

    it("supports 'ls' alias", async () => {
      await env.run(testCtx, makeEnvArgs("ls", "--app=test"));

      expectStdout().toContain("development");
      expectStdout().toContain("production");
    });
  });

  describe("create", () => {
    it("creates an environment", async () => {
      nockEditResponse({
        operation: CREATE_ENVIRONMENT_MUTATION,
        response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
        expectVariables: { environment: { slug: "staging" } },
      });

      await env.run(testCtx, makeEnvArgs("create", "staging", "--app=test"));

      expectStdout().toContain("Created environment staging");
    });

    it("creates an environment with --from", async () => {
      nockEditResponse({
        operation: CREATE_ENVIRONMENT_MUTATION,
        response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
        expectVariables: { environment: { slug: "staging", sourceSlug: "development" } },
      });

      await env.run(testCtx, makeEnvArgs("create", "staging", "--from=development", "--app=test"));

      expectStdout().toContain("Created environment staging");
    });

    it("lowercases the environment name", async () => {
      nockEditResponse({
        operation: CREATE_ENVIRONMENT_MUTATION,
        response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
        expectVariables: { environment: { slug: "staging" } },
      });

      await env.run(testCtx, makeEnvArgs("create", "Staging", "--app=test"));

      expectStdout().toContain("Created environment staging");
    });

    it("errors when no name provided", async () => {
      const error = await expectError(() => env.run(testCtx, makeEnvArgs("create", "--app=test")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Missing required argument");
    });

    describe("--from defaults to sync context environment", () => {
      let originalCwd: typeof process.cwd;
      let syncJsonDir: string;
      let syncJsonPath: string;

      beforeEach(() => {
        syncJsonDir = testDirPath("create-from-cwd");
        syncJsonPath = path.join(syncJsonDir, ".gadget", "sync.json");

        originalCwd = process.cwd;
        process.cwd = () => syncJsonDir;
      });

      afterEach(() => {
        process.cwd = originalCwd;
      });

      it("defaults --from to the current sync environment", async () => {
        await fs.outputJSON(syncJsonPath, {
          application: "test",
          environment: "development",
          environments: { development: { filesVersion: "1" } },
        });

        nockEditResponse({
          operation: CREATE_ENVIRONMENT_MUTATION,
          response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
          expectVariables: { environment: { slug: "staging", sourceSlug: "development" } },
        });

        await env.run(testCtx, makeEnvArgs("create", "staging", "--app=test"));

        expectStdout().toContain("Created environment staging");
      });

      it("explicit --from overrides sync context default", async () => {
        await fs.outputJSON(syncJsonPath, {
          application: "test",
          environment: "development",
          environments: { development: { filesVersion: "1" } },
        });

        nockEditResponse({
          operation: CREATE_ENVIRONMENT_MUTATION,
          response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
          expectVariables: { environment: { slug: "staging", sourceSlug: "cool-environment-development" } },
        });

        await env.run(testCtx, makeEnvArgs("create", "staging", "--from=cool-environment-development", "--app=test"));

        expectStdout().toContain("Created environment staging");
      });

      it("does not set --from when no sync context exists", async () => {
        // syncJsonDir exists but has no .gadget/sync.json
        await fs.ensureDir(syncJsonDir);

        nockEditResponse({
          operation: CREATE_ENVIRONMENT_MUTATION,
          response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
          expectVariables: { environment: { slug: "staging" } },
        });

        await env.run(testCtx, makeEnvArgs("create", "staging", "--app=test"));

        expectStdout().toContain("Created environment staging");
      });
    });

    describe("create --use", () => {
      let originalCwd: typeof process.cwd;
      let syncJsonDir: string;
      let syncJsonPath: string;

      beforeEach(() => {
        syncJsonDir = testDirPath("create-use-cwd");
        syncJsonPath = path.join(syncJsonDir, ".gadget", "sync.json");

        originalCwd = process.cwd;
        process.cwd = () => syncJsonDir;
      });

      afterEach(() => {
        process.cwd = originalCwd;
      });

      it("creates an environment with --use and updates existing sync.json", async () => {
        await fs.outputJSON(syncJsonPath, {
          application: "test",
          environment: "development",
          environments: { development: { filesVersion: "42" } },
        });

        nockEditResponse({
          operation: CREATE_ENVIRONMENT_MUTATION,
          response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
          expectVariables: { environment: { slug: "staging", sourceSlug: "development" } },
        });

        await env.run(testCtx, makeEnvArgs("create", "staging", "--use", "--app=test"));

        expectStdout().toContain("Created environment staging");
        expectStdout().toContain("Switched environment: development → staging");

        const state = await fs.readJSON(syncJsonPath);
        expect(state.application).toBe("test");
        expect(state.environment).toBe("staging");
        expect(state.environments["staging"]).toEqual({ filesVersion: "0" });
        expect(state.environments["development"]).toEqual({ filesVersion: "42" });
      });

      it("creates an environment with --use and creates sync.json when none exists", async () => {
        await fs.ensureDir(syncJsonDir);

        nockEditResponse({
          operation: CREATE_ENVIRONMENT_MUTATION,
          response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
          expectVariables: { environment: { slug: "staging" } },
        });

        await env.run(testCtx, makeEnvArgs("create", "staging", "--use", "--app=test"));

        expectStdout().toContain("Created environment staging");
        expectStdout().toContain("Activated environment staging");

        const state = await fs.readJSON(syncJsonPath);
        expect(state.application).toBe("test");
        expect(state.environment).toBe("staging");
        expect(state.environments["staging"]).toEqual({ filesVersion: "0" });
      });

      it("creates an environment with --use and --from", async () => {
        await fs.ensureDir(syncJsonDir);

        nockEditResponse({
          operation: CREATE_ENVIRONMENT_MUTATION,
          response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
          expectVariables: { environment: { slug: "staging", sourceSlug: "development" } },
        });

        await env.run(testCtx, makeEnvArgs("create", "staging", "--from=development", "--use", "--app=test"));

        expectStdout().toContain("Created environment staging");
        expectStdout().toContain("Activated environment staging");

        const state = await fs.readJSON(syncJsonPath);
        expect(state.environment).toBe("staging");
      });

      it("errors with --use when sync.json app doesn't match --app", async () => {
        await fs.outputJSON(syncJsonPath, {
          application: "other-app",
          environment: "development",
          environments: { development: { filesVersion: "1" } },
        });

        nockEditResponse({
          operation: CREATE_ENVIRONMENT_MUTATION,
          response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
          expectVariables: { environment: { slug: "staging", sourceSlug: "development" } },
        });

        const error = await expectError(() => env.run(testCtx, makeEnvArgs("create", "staging", "--use", "--app=test")));
        expect(error).toBeInstanceOf(ArgError);
        expect(error.message).toContain("other-app");
        expect(error.message).toContain("test");
      });

      it("lowercases the name in --use flow and stores lowercase in sync.json", async () => {
        await fs.ensureDir(syncJsonDir);

        nockEditResponse({
          operation: CREATE_ENVIRONMENT_MUTATION,
          response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
          expectVariables: { environment: { slug: "staging" } },
        });

        await env.run(testCtx, makeEnvArgs("create", "Staging", "--use", "--app=test"));

        expectStdout().toContain("Created environment staging");
        expectStdout().toContain("Activated environment staging");

        const state = await fs.readJSON(syncJsonPath);
        expect(state.application).toBe("test");
        expect(state.environment).toBe("staging");
        expect(state.environments["staging"]).toEqual({ filesVersion: "0" });
        // Ensure no uppercase key was created
        expect(state.environments["Staging"]).toBeUndefined();
      });

      it("creates without --use does not touch sync.json", async () => {
        nockEditResponse({
          operation: CREATE_ENVIRONMENT_MUTATION,
          response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
          expectVariables: { environment: { slug: "staging" } },
        });

        await env.run(testCtx, makeEnvArgs("create", "staging", "--app=test"));

        expectStdout().toContain("Created environment staging");
        const exists = await fs.pathExists(syncJsonPath);
        expect(exists).toBe(false);
      });
    });
  });

  describe("delete", () => {
    it("deletes an environment with confirmation", async () => {
      mockConfirmOnce();

      nockEditResponse({
        operation: DELETE_ENVIRONMENT_MUTATION,
        response: { data: { deleteEnvironment: true } },
        expectVariables: { slug: "cool-environment-development" },
      });

      await env.run(testCtx, makeEnvArgs("delete", "cool-environment-development", "--app=test"));

      expect(confirm).toHaveBeenCalledTimes(1);
      expectStdout().toContain("Deleted environment cool-environment-development");
    });

    it("deletes with --force (no confirmation)", async () => {
      nockEditResponse({
        operation: DELETE_ENVIRONMENT_MUTATION,
        response: { data: { deleteEnvironment: true } },
        expectVariables: { slug: "cool-environment-development" },
      });

      await env.run(testCtx, makeEnvArgs("delete", "cool-environment-development", "--force", "--app=test"));

      expect(confirm).not.toHaveBeenCalled();
      expectStdout().toContain("Deleted environment cool-environment-development");
    });

    it("errors when trying to delete production", async () => {
      const error = await expectError(() => env.run(testCtx, makeEnvArgs("delete", "production", "--app=test")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("production");
    });

    it("errors when no name provided", async () => {
      const error = await expectError(() => env.run(testCtx, makeEnvArgs("delete", "--app=test")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Missing required argument");
    });

    it("errors when environment not found", async () => {
      const error = await expectError(() => env.run(testCtx, makeEnvArgs("delete", "nonexistent", "--app=test")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Unknown environment");
    });

    it("errors gracefully when app has no environments", async () => {
      nock.cleanAll();
      loginTestUserWithToken({ optional: true });
      const emptyApp = { ...testApp, slug: "empty-app", environments: [] };
      matchAuthHeader(nock(`https://${config.domains.services}`).get("/auth/api/apps").reply(200, [emptyApp, testApp2]));

      const error = await expectError(() => env.run(testCtx, makeEnvArgs("delete", "staging", "--app=empty-app")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("No environments found");
    });
  });

  describe("unpause", () => {
    it("unpauses an environment", async () => {
      nockEditResponse({
        operation: UNPAUSE_ENVIRONMENT_MUTATION,
        response: { data: { unpauseEnvironment: { success: true, alreadyActive: false } } },
        environment: { ...testApp.environments[0]!, application: testApp },
      });

      await env.run(testCtx, makeEnvArgs("unpause", "development", "--app=test"));

      expectStdout().toContain("Unpaused environment development");
    });

    it("handles already active environment", async () => {
      nockEditResponse({
        operation: UNPAUSE_ENVIRONMENT_MUTATION,
        response: { data: { unpauseEnvironment: { success: true, alreadyActive: true } } },
        environment: { ...testApp.environments[0]!, application: testApp },
      });

      await env.run(testCtx, makeEnvArgs("unpause", "development", "--app=test"));

      expectStdout().toContain("already active");
    });

    it("errors when no name provided", async () => {
      const error = await expectError(() => env.run(testCtx, makeEnvArgs("unpause", "--app=test")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Missing required argument");
    });

    it("errors when environment not found", async () => {
      const error = await expectError(() => env.run(testCtx, makeEnvArgs("unpause", "nonexistent", "--app=test")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Unknown environment");
    });
  });

  describe("use", () => {
    let originalCwd: typeof process.cwd;
    let syncJsonDir: string;
    let syncJsonPath: string;

    beforeEach(async () => {
      syncJsonDir = testDirPath("use-cwd");
      syncJsonPath = path.join(syncJsonDir, ".gadget", "sync.json");
      await fs.outputJSON(syncJsonPath, {
        application: "test",
        environment: "development",
        environments: { development: { filesVersion: "42" } },
      });

      originalCwd = process.cwd;
      process.cwd = () => syncJsonDir;
    });

    afterEach(() => {
      process.cwd = originalCwd;
    });

    it("uses an environment", async () => {
      await env.run(testCtx, makeEnvArgs("use", "cool-environment-development", "--app=test"));

      expectStdout().toContain("Switched environment: development → cool-environment-development");

      const state = await fs.readJSON(syncJsonPath);
      expect(state.environment).toBe("cool-environment-development");
      expect(state.environments["cool-environment-development"]).toEqual({ filesVersion: "0" });
      expect(state.environments["development"]).toEqual({ filesVersion: "42" });
    });

    it("preserves existing filesVersion when environment already has an entry", async () => {
      await fs.outputJSON(syncJsonPath, {
        application: "test",
        environment: "development",
        environments: {
          development: { filesVersion: "42" },
          "cool-environment-development": { filesVersion: "99" },
        },
      });

      await env.run(testCtx, makeEnvArgs("use", "cool-environment-development", "--app=test"));

      const state = await fs.readJSON(syncJsonPath);
      expect(state.environment).toBe("cool-environment-development");
      expect(state.environments["cool-environment-development"]).toEqual({ filesVersion: "99" });
    });

    it("prints message when already on target environment", async () => {
      await env.run(testCtx, makeEnvArgs("use", "development", "--app=test"));

      expectStdout().toContain("Already on environment development.");
    });

    it("errors when trying to use production", async () => {
      const error = await expectError(() => env.run(testCtx, makeEnvArgs("use", "production", "--app=test")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("production");
    });

    it("errors when no name provided", async () => {
      const error = await expectError(() => env.run(testCtx, makeEnvArgs("use", "--app=test")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Missing required argument");
    });

    it("errors when environment not found", async () => {
      const error = await expectError(() => env.run(testCtx, makeEnvArgs("use", "nonexistent", "--app=test")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Unknown environment");
    });

    it("creates sync.json when none exists", async () => {
      const emptyDir = testDirPath("no-sync-json");
      await fs.ensureDir(emptyDir);
      process.cwd = () => emptyDir;

      await env.run(testCtx, makeEnvArgs("use", "cool-environment-development", "--app=test"));

      expectStdout().toContain("Activated environment cool-environment-development");

      const newSyncJsonPath = path.join(emptyDir, ".gadget", "sync.json");
      const state = await fs.readJSON(newSyncJsonPath);
      expect(state.application).toBe("test");
      expect(state.environment).toBe("cool-environment-development");
      expect(state.environments["cool-environment-development"]).toEqual({ filesVersion: "0" });
    });
  });

  describe("help/usage", () => {
    it("prints help when no subcommand is given", async () => {
      await env.run(testCtx, makeEnvArgs());

      expectStdout().toContain("ggt env <command>");
      expectStdout().toContain("list");
      expectStdout().toContain("create");
      expectStdout().toContain("delete");
      expectStdout().toContain("unpause");
      expectStdout().toContain("use");
    });

    it("prints help for list -h", async () => {
      await expectProcessExit(() => env.run(testCtx, makeEnvArgs("list", "-h")));

      expectStdout().toContain("ggt env list");
    });

    it("prints help for create -h", async () => {
      await expectProcessExit(() => env.run(testCtx, makeEnvArgs("create", "-h")));

      expectStdout().toContain("ggt env create");
      expectStdout().toContain("--from");
    });

    it("prints help for delete -h", async () => {
      await expectProcessExit(() => env.run(testCtx, makeEnvArgs("delete", "-h")));

      expectStdout().toContain("ggt env delete");
      expectStdout().toContain("--force");
    });

    it("prints help for unpause -h", async () => {
      await expectProcessExit(() => env.run(testCtx, makeEnvArgs("unpause", "-h")));

      expectStdout().toContain("ggt env unpause");
    });

    it("prints help for use -h", async () => {
      await expectProcessExit(() => env.run(testCtx, makeEnvArgs("use", "-h")));

      expectStdout().toContain("ggt env use");
    });
  });

  describe("unknown subcommand", () => {
    it("errors on unknown subcommand", async () => {
      const error = await expectError(() => env.run(testCtx, makeEnvArgs("bogus", "--app=test")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Unknown subcommand");
    });
  });
});
