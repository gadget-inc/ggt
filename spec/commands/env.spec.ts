import fs from "fs-extra";
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
import { confirm } from "../../src/services/output/confirm.js";
import { nockTestApps, testApp } from "../__support__/app.js";
import { makeArgsWithOptions } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { expectError } from "../__support__/error.js";
import { nockEditResponse } from "../__support__/graphql.js";
import { mockConfirmOnce } from "../__support__/mock.js";
import { expectStdout } from "../__support__/output.js";
import { testDirPath } from "../__support__/paths.js";
import { expectProcessExit } from "../__support__/process.js";
import { loginTestUser } from "../__support__/user.js";

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

    it("errors when no name provided", async () => {
      const error = await expectError(() => env.run(testCtx, makeEnvArgs("create", "--app=test")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Missing required argument");
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

    it("errors when no sync.json found", async () => {
      const emptyDir = testDirPath("no-sync-json");
      await fs.ensureDir(emptyDir);
      process.cwd = () => emptyDir;

      const error = await expectError(() => env.run(testCtx, makeEnvArgs("use", "cool-environment-development", "--app=test")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("No .gadget/sync.json found");
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
