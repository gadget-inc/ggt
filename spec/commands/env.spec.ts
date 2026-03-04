import path from "node:path";

import fs from "fs-extra";
import nock from "nock";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EnvironmentStatus } from "../../src/__generated__/graphql.js";
import envCommand from "../../src/commands/env.js";
import {
  CREATE_ENVIRONMENT_MUTATION,
  DELETE_ENVIRONMENT_MUTATION,
  UNPAUSE_ENVIRONMENT_MUTATION,
} from "../../src/services/app/edit/operation.js";
import { ArgError } from "../../src/services/command/arg.js";
import { runCommand } from "../../src/services/command/run.js";
import { config } from "../../src/services/config/config.js";
import { confirm } from "../../src/services/output/confirm.js";
import { nockTestApps, testApp, testApp2 } from "../__support__/app.js";
import { testCtx } from "../__support__/context.js";
import { expectError } from "../__support__/error.js";
import { nockEditResponse } from "../__support__/graphql.js";
import { mockConfirmOnce } from "../__support__/mock.js";
import { expectStdout } from "../__support__/output.js";
import { testDirPath } from "../__support__/paths.js";
import { loginTestUser, loginTestUserWithCookie, matchAuthHeader } from "../__support__/user.js";

describe("env", () => {
  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  describe("list", () => {
    it("lists environments with name and type", async () => {
      await runCommand(testCtx, envCommand, "list", "--app=test");

      expectStdout().toContain("development");
      expectStdout().toContain("production");
    });

    it("supports 'ls' alias", async () => {
      await runCommand(testCtx, envCommand, "ls", "--app=test");

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

      await runCommand(testCtx, envCommand, "create", "staging", "--app=test");

      expectStdout().toContain("Created environment staging");
    });

    it("creates an environment with --from", async () => {
      nockEditResponse({
        operation: CREATE_ENVIRONMENT_MUTATION,
        response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
        expectVariables: { environment: { slug: "staging", sourceSlug: "development" } },
      });

      await runCommand(testCtx, envCommand, "create", "staging", "--from=development", "--app=test");

      expectStdout().toContain("Created environment staging");
    });

    it("lowercases --from value", async () => {
      nockEditResponse({
        operation: CREATE_ENVIRONMENT_MUTATION,
        response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
        expectVariables: { environment: { slug: "staging", sourceSlug: "development" } },
      });

      await runCommand(testCtx, envCommand, "create", "staging", "--from=Development", "--app=test");

      expectStdout().toContain("Created environment staging");
    });

    it("lowercases the environment name", async () => {
      nockEditResponse({
        operation: CREATE_ENVIRONMENT_MUTATION,
        response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
        expectVariables: { environment: { slug: "staging" } },
      });

      await runCommand(testCtx, envCommand, "create", "Staging", "--app=test");

      expectStdout().toContain("Created environment staging");
    });

    it("errors when no name provided", async () => {
      const error = await expectError(() => runCommand(testCtx, envCommand, "create", "--app=test"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`"Missing required argument: name"`);
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

        await runCommand(testCtx, envCommand, "create", "staging", "--app=test");

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

        await runCommand(testCtx, envCommand, "create", "staging", "--from=cool-environment-development", "--app=test");

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

        await runCommand(testCtx, envCommand, "create", "staging", "--app=test");

        expectStdout().toContain("Created environment staging");
      });

      it("does not use sync context --from when --app targets a different application", async () => {
        await fs.outputJSON(syncJsonPath, {
          application: "other-app",
          environment: "my-custom-env",
          environments: { "my-custom-env": { filesVersion: "1" } },
        });

        nockEditResponse({
          operation: CREATE_ENVIRONMENT_MUTATION,
          response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
          expectVariables: { environment: { slug: "staging" } },
        });

        await runCommand(testCtx, envCommand, "create", "staging", "--app=test");

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

        await runCommand(testCtx, envCommand, "create", "staging", "--use", "--app=test");

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

        await runCommand(testCtx, envCommand, "create", "staging", "--use", "--app=test");

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

        await runCommand(testCtx, envCommand, "create", "staging", "--from=development", "--use", "--app=test");

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

        // No nockEditResponse — the error is thrown before the create mutation
        const error = await expectError(() => runCommand(testCtx, envCommand, "create", "staging", "--use", "--app=test"));
        expect(error).toBeInstanceOf(ArgError);
        expect(error.message).toMatchInlineSnapshot(`
          "Cannot use --use: this directory is synced to other-app, but you specified test.

          Either run this command from a directory synced to test, or omit the --app flag."
        `);
      });

      it("lowercases the name in --use flow and stores lowercase in sync.json", async () => {
        await fs.ensureDir(syncJsonDir);

        nockEditResponse({
          operation: CREATE_ENVIRONMENT_MUTATION,
          response: { data: { createEnvironment: { slug: "staging", status: EnvironmentStatus.Active } } },
          expectVariables: { environment: { slug: "staging" } },
        });

        await runCommand(testCtx, envCommand, "create", "Staging", "--use", "--app=test");

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

        await runCommand(testCtx, envCommand, "create", "staging", "--app=test");

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

      await runCommand(testCtx, envCommand, "delete", "cool-environment-development", "--app=test");

      expect(confirm).toHaveBeenCalledTimes(1);
      expectStdout().toContain("Deleted environment cool-environment-development");
    });

    it("deletes with --force (no confirmation)", async () => {
      nockEditResponse({
        operation: DELETE_ENVIRONMENT_MUTATION,
        response: { data: { deleteEnvironment: true } },
        expectVariables: { slug: "cool-environment-development" },
      });

      await runCommand(testCtx, envCommand, "delete", "cool-environment-development", "--force", "--app=test");

      expect(confirm).not.toHaveBeenCalled();
      expectStdout().toContain("Deleted environment cool-environment-development");
    });

    it("errors when trying to delete production", async () => {
      const error = await expectError(() => runCommand(testCtx, envCommand, "delete", "production", "--app=test"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`"Cannot delete the production environment."`);
    });

    it("errors when no name provided", async () => {
      const error = await expectError(() => runCommand(testCtx, envCommand, "delete", "--app=test"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`"Missing required argument: name"`);
    });

    it("errors when environment not found", async () => {
      const error = await expectError(() => runCommand(testCtx, envCommand, "delete", "nonexistent", "--app=test"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`
        "Unknown environment: nonexistent

        Did you mean one of these?

          • development
          • production
          • cool-environment-development
          • other-environment-development"
      `);
    });

    it("errors gracefully when app has no environments", async () => {
      nock.cleanAll();
      loginTestUserWithCookie();
      const emptyApp = { ...testApp, slug: "empty-app", environments: [] };
      matchAuthHeader(nock(`https://${config.domains.services}`).get("/auth/api/apps").reply(200, [emptyApp, testApp2]));

      const error = await expectError(() => runCommand(testCtx, envCommand, "delete", "staging", "--app=empty-app"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`"No environments found for empty-app."`);
    });

    it("warns when deleting the active sync environment", async () => {
      const syncJsonDir = testDirPath("delete-active-env");
      const syncJsonPath = path.join(syncJsonDir, ".gadget", "sync.json");
      await fs.outputJSON(syncJsonPath, {
        application: "test",
        environment: "cool-environment-development",
        environments: { "cool-environment-development": { filesVersion: "42" } },
      });

      const originalCwd = process.cwd;
      process.cwd = () => syncJsonDir;

      try {
        nockEditResponse({
          operation: DELETE_ENVIRONMENT_MUTATION,
          response: { data: { deleteEnvironment: true } },
          expectVariables: { slug: "cool-environment-development" },
        });

        await runCommand(testCtx, envCommand, "delete", "cool-environment-development", "--force", "--app=test");

        expectStdout().toContain("Deleted environment cool-environment-development");
        expectStdout().toContain("Warning");
        expectStdout().toContain("ggt env use");
      } finally {
        process.cwd = originalCwd;
      }
    });
  });

  describe("unpause", () => {
    it("unpauses an environment", async () => {
      nockEditResponse({
        operation: UNPAUSE_ENVIRONMENT_MUTATION,
        response: { data: { unpauseEnvironment: { success: true, alreadyActive: false } } },
        environment: { ...testApp.environments[0]!, application: testApp },
      });

      await runCommand(testCtx, envCommand, "unpause", "development", "--app=test");

      expectStdout().toContain("Unpaused environment development");
    });

    it("handles already active environment", async () => {
      nockEditResponse({
        operation: UNPAUSE_ENVIRONMENT_MUTATION,
        response: { data: { unpauseEnvironment: { success: true, alreadyActive: true } } },
        environment: { ...testApp.environments[0]!, application: testApp },
      });

      await runCommand(testCtx, envCommand, "unpause", "development", "--app=test");

      expectStdout().toContain("already active");
    });

    it("errors when no name provided", async () => {
      const error = await expectError(() => runCommand(testCtx, envCommand, "unpause", "--app=test"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`"Missing required argument: name"`);
    });

    it("errors when environment not found", async () => {
      const error = await expectError(() => runCommand(testCtx, envCommand, "unpause", "nonexistent", "--app=test"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`
        "Unknown environment: nonexistent

        Did you mean one of these?

          • development
          • production
          • cool-environment-development
          • other-environment-development"
      `);
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
      await runCommand(testCtx, envCommand, "use", "cool-environment-development", "--app=test");

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

      await runCommand(testCtx, envCommand, "use", "cool-environment-development", "--app=test");

      const state = await fs.readJSON(syncJsonPath);
      expect(state.environment).toBe("cool-environment-development");
      expect(state.environments["cool-environment-development"]).toEqual({ filesVersion: "99" });
    });

    it("prints message when already on target environment", async () => {
      await runCommand(testCtx, envCommand, "use", "development", "--app=test");

      expectStdout().toContain("Already on environment development.");
    });

    it("errors when trying to use production", async () => {
      const error = await expectError(() => runCommand(testCtx, envCommand, "use", "production", "--app=test"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`
        "Cannot use the production environment.

        Use ggt pull --env production to pull from production instead."
      `);
    });

    it("errors when no name provided", async () => {
      const error = await expectError(() => runCommand(testCtx, envCommand, "use", "--app=test"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`"Missing required argument: name"`);
    });

    it("errors when environment not found", async () => {
      const error = await expectError(() => runCommand(testCtx, envCommand, "use", "nonexistent", "--app=test"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`
        "Unknown environment: nonexistent

        Did you mean one of these?

          • development
          • production
          • cool-environment-development
          • other-environment-development"
      `);
    });

    it("creates sync.json when none exists", async () => {
      const emptyDir = testDirPath("no-sync-json");
      await fs.ensureDir(emptyDir);
      process.cwd = () => emptyDir;

      await runCommand(testCtx, envCommand, "use", "cool-environment-development", "--app=test");

      expectStdout().toContain("Activated environment cool-environment-development");

      const newSyncJsonPath = path.join(emptyDir, ".gadget", "sync.json");
      const state = await fs.readJSON(newSyncJsonPath);
      expect(state.application).toBe("test");
      expect(state.environment).toBe("cool-environment-development");
      expect(state.environments["cool-environment-development"]).toEqual({ filesVersion: "0" });
    });
  });

  describe("unknown subcommand", () => {
    it("errors on unknown subcommand", async () => {
      const error = await expectError(() => runCommand(testCtx, envCommand, "bogus", "--app=test"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`
        "Unknown subcommand bogus

        Did you mean use?

        USAGE
          ggt env <command> [flags]

        Run ggt env -h for more information."
      `);
    });
  });
});
