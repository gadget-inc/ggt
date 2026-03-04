import { GraphQLError } from "graphql";
import { beforeEach, describe, expect, it } from "vitest";

import * as vars from "../../src/commands/var.js";
import {
  DELETE_ENVIRONMENT_VARIABLE_MUTATION,
  ENVIRONMENT_VARIABLES_QUERY,
  SET_ENVIRONMENT_VARIABLE_MUTATION,
} from "../../src/services/app/edit/operation.js";
import { ArgError } from "../../src/services/command/arg.js";
import { confirm } from "../../src/services/output/confirm.js";
import { nockTestApps, testApp } from "../__support__/app.js";
import { makeArgsWithOptions } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { expectError } from "../__support__/error.js";
import { writeDir } from "../__support__/files.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { nockEditResponse } from "../__support__/graphql.js";
import { mockConfirmOnce } from "../__support__/mock.js";
import { expectStdout } from "../__support__/output.js";
import { testDirPath } from "../__support__/paths.js";
import { expectProcessExit } from "../__support__/process.js";
import { loginTestUser } from "../__support__/user.js";

const makeVarsArgs = (...argv: string[]) => {
  return makeArgsWithOptions(vars.args, vars.parseOptions, "var", ...argv);
};

describe("var", () => {
  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  describe("list", () => {
    it("lists environment variable keys", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: ENVIRONMENT_VARIABLES_QUERY,
        response: {
          data: {
            environmentVariables: [
              { key: "DATABASE_URL", value: "postgres://localhost", isSecret: false },
              { key: "API_KEY", value: null, isSecret: true },
            ],
          },
        },
      });

      await vars.run(testCtx, makeVarsArgs("list"));

      expectStdout().toContain("DATABASE_URL");
      expectStdout().toContain("API_KEY");
      expectStdout().not.toContain("postgres://localhost");
      expectStdout().not.toContain("<secret>");
    });

    it("handles empty list", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: ENVIRONMENT_VARIABLES_QUERY,
        response: { data: { environmentVariables: [] } },
      });

      await vars.run(testCtx, makeVarsArgs("list"));

      expectStdout().toContain("No environment variables found.");
    });
  });

  describe("get", () => {
    it("prints the value of a variable", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: ENVIRONMENT_VARIABLES_QUERY,
        response: {
          data: {
            environmentVariables: [{ key: "DATABASE_URL", value: "postgres://localhost", isSecret: false }],
          },
        },
      });

      await vars.run(testCtx, makeVarsArgs("get", "DATABASE_URL"));

      expectStdout().toContain("postgres://localhost");
    });

    it("errors when variable is a secret", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: ENVIRONMENT_VARIABLES_QUERY,
        response: {
          data: {
            environmentVariables: [{ key: "API_KEY", value: null, isSecret: true }],
          },
        },
      });

      const error = await expectError(() => vars.run(testCtx, makeVarsArgs("get", "API_KEY")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("secret");
    });

    it("errors when variable not found", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: ENVIRONMENT_VARIABLES_QUERY,
        response: { data: { environmentVariables: [] } },
      });

      const error = await expectError(() => vars.run(testCtx, makeVarsArgs("get", "MISSING_KEY")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("MISSING_KEY");
    });

    it("errors when no key argument provided", async () => {
      await makeSyncScenario();

      const error = await expectError(() => vars.run(testCtx, makeVarsArgs("get")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Missing required argument");
    });
  });

  describe("set", () => {
    it("sets a single variable", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { input: { key: "API_KEY", value: "abc123", isSecret: false } },
      });

      await vars.run(testCtx, makeVarsArgs("set", "API_KEY=abc123"));

      expectStdout().toContain("API_KEY");
    });

    it("sets multiple variables", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { input: { key: "KEY1", value: "val1", isSecret: false } },
      });

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "3" } } },
        expectVariables: { input: { key: "KEY2", value: "val2", isSecret: false } },
      });

      await vars.run(testCtx, makeVarsArgs("set", "KEY1=val1", "KEY2=val2"));

      expectStdout().toContain("KEY1");
      expectStdout().toContain("KEY2");
    });

    it("sets a secret variable with --secret", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { input: { key: "SECRET", value: "xyz", isSecret: true } },
      });

      await vars.run(testCtx, makeVarsArgs("set", "--secret", "SECRET=xyz"));

      expectStdout().toContain("SECRET");
    });

    it("handles values with = signs", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { input: { key: "URL", value: "postgres://host?opt=val", isSecret: false } },
      });

      await vars.run(testCtx, makeVarsArgs("set", "URL=postgres://host?opt=val"));

      expectStdout().toContain("URL");
    });

    it("handles empty values", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { input: { key: "EMPTY", value: "", isSecret: false } },
      });

      await vars.run(testCtx, makeVarsArgs("set", "EMPTY="));

      expectStdout().toContain("EMPTY");
    });

    it("errors on bad format (no =)", async () => {
      await makeSyncScenario();

      const error = await expectError(() => vars.run(testCtx, makeVarsArgs("set", "INVALID_FORMAT")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Invalid format");
    });

    it("errors on empty key (=value)", async () => {
      await makeSyncScenario();

      const error = await expectError(() => vars.run(testCtx, makeVarsArgs("set", "=value")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Invalid format");
    });

    it("errors when no key=value provided", async () => {
      await makeSyncScenario();

      const error = await expectError(() => vars.run(testCtx, makeVarsArgs("set")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Missing required argument");
    });
  });

  describe("delete", () => {
    it("deletes a variable with confirmation", async () => {
      await makeSyncScenario();

      mockConfirmOnce();

      nockEditResponse({
        operation: DELETE_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { deleteEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { key: "API_KEY" },
      });

      await vars.run(testCtx, makeVarsArgs("delete", "API_KEY"));

      expect(confirm).toHaveBeenCalledTimes(1);
      expectStdout().toContain("Deleted API_KEY");
    });

    it("deletes with --force (no confirmation)", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: DELETE_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { deleteEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { key: "API_KEY" },
      });

      await vars.run(testCtx, makeVarsArgs("delete", "--force", "API_KEY"));

      expect(confirm).not.toHaveBeenCalled();
      expectStdout().toContain("Deleted API_KEY");
    });

    it("deletes all with --all", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: ENVIRONMENT_VARIABLES_QUERY,
        response: {
          data: {
            environmentVariables: [
              { key: "KEY1", value: "val1", isSecret: false },
              { key: "KEY2", value: "val2", isSecret: false },
            ],
          },
        },
      });

      mockConfirmOnce();

      nockEditResponse({
        operation: DELETE_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { deleteEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { key: "KEY1" },
      });

      nockEditResponse({
        operation: DELETE_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { deleteEnvironmentVariable: { remoteFilesVersion: "3" } } },
        expectVariables: { key: "KEY2" },
      });

      await vars.run(testCtx, makeVarsArgs("delete", "--all"));

      expect(confirm).toHaveBeenCalledTimes(1);
      expectStdout().toContain("Deleted KEY1, KEY2");
    });

    it("handles --all with no variables", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: ENVIRONMENT_VARIABLES_QUERY,
        response: { data: { environmentVariables: [] } },
      });

      await vars.run(testCtx, makeVarsArgs("delete", "--all"));

      expectStdout().toContain("No environment variables to delete.");
    });

    it("--force suppresses not-found errors", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: DELETE_ENVIRONMENT_VARIABLE_MUTATION,
        response: { errors: [new GraphQLError("Environment variable not found")] },
        expectVariables: { key: "NONEXISTENT" },
      });

      await vars.run(testCtx, makeVarsArgs("delete", "--force", "NONEXISTENT"));

      expectStdout().toContain("Deleted NONEXISTENT");
    });

    it("errors when no key provided and --all not used", async () => {
      await makeSyncScenario();

      const error = await expectError(() => vars.run(testCtx, makeVarsArgs("delete")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Missing required argument");
    });
  });

  describe("import --from", () => {
    it("imports specific keys as placeholders", async () => {
      await makeSyncScenario();

      // mock source environment query
      nockEditResponse({
        operation: ENVIRONMENT_VARIABLES_QUERY,
        response: {
          data: {
            environmentVariables: [
              { key: "DB_URL", value: "postgres://staging", isSecret: false },
              { key: "OTHER", value: "other_val", isSecret: false },
            ],
          },
        },
        environment: { ...testApp.environments[2]!, application: testApp },
      });

      // mock set on target environment
      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { input: { key: "DB_URL", value: "", isSecret: false } },
      });

      await vars.run(testCtx, makeVarsArgs("import", "--from=cool-environment-development", "DB_URL"));

      expectStdout().toContain("Imported DB_URL from cool-environment-development");
    });

    it("imports all keys with --all", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: ENVIRONMENT_VARIABLES_QUERY,
        response: {
          data: {
            environmentVariables: [
              { key: "KEY1", value: "val1", isSecret: false },
              { key: "KEY2", value: "val2", isSecret: false },
            ],
          },
        },
        environment: { ...testApp.environments[2]!, application: testApp },
      });

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { input: { key: "KEY1", value: "", isSecret: false } },
      });

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "3" } } },
        expectVariables: { input: { key: "KEY2", value: "", isSecret: false } },
      });

      await vars.run(testCtx, makeVarsArgs("import", "--from=cool-environment-development", "--all"));

      expectStdout().toContain("Imported KEY1, KEY2 from cool-environment-development");
    });

    it("imports with --include-values", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: ENVIRONMENT_VARIABLES_QUERY,
        response: {
          data: {
            environmentVariables: [{ key: "DB_URL", value: "postgres://staging", isSecret: false }],
          },
        },
        environment: { ...testApp.environments[2]!, application: testApp },
      });

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { input: { key: "DB_URL", value: "postgres://staging", isSecret: false } },
      });

      await vars.run(testCtx, makeVarsArgs("import", "--from=cool-environment-development", "--include-values", "DB_URL"));

      expectStdout().toContain("Imported DB_URL from cool-environment-development");
    });

    it("skips secrets when --include-values is used", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: ENVIRONMENT_VARIABLES_QUERY,
        response: {
          data: {
            environmentVariables: [
              { key: "PUBLIC", value: "public_val", isSecret: false },
              { key: "SECRET", value: null, isSecret: true },
            ],
          },
        },
        environment: { ...testApp.environments[2]!, application: testApp },
      });

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { input: { key: "PUBLIC", value: "public_val", isSecret: false } },
      });

      await vars.run(testCtx, makeVarsArgs("import", "--from=cool-environment-development", "--include-values", "--all"));

      expectStdout().toContain("Imported PUBLIC from cool-environment-development");
      expectStdout().toContain("Skipped secret variables");
      expectStdout().toContain("SECRET");
    });

    it("errors on unknown source environment", async () => {
      await makeSyncScenario();

      const error = await expectError(() => vars.run(testCtx, makeVarsArgs("import", "--from=nonexistent", "--all")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Unknown environment");
    });

    it("errors when specified keys not found in source", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: ENVIRONMENT_VARIABLES_QUERY,
        response: { data: { environmentVariables: [] } },
        environment: { ...testApp.environments[2]!, application: testApp },
      });

      const error = await expectError(() => vars.run(testCtx, makeVarsArgs("import", "--from=cool-environment-development", "MISSING")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("MISSING");
    });
  });

  describe("import --from-file", () => {
    it("imports from a .env file", async () => {
      await makeSyncScenario();

      const envFilePath = testDirPath("test.env");
      await writeDir(testDirPath(), { "test.env": "KEY1=value1\nKEY2=value2\n" });

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { input: { key: "KEY1", value: "value1", isSecret: false } },
      });

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "3" } } },
        expectVariables: { input: { key: "KEY2", value: "value2", isSecret: false } },
      });

      await vars.run(testCtx, makeVarsArgs("import", `--from-file=${envFilePath}`, "--all"));

      expectStdout().toContain("Imported KEY1, KEY2");
    });

    it("handles export prefix and quotes", async () => {
      await makeSyncScenario();

      const envFilePath = testDirPath("test.env");
      await writeDir(testDirPath(), {
        "test.env": "export KEY1=\"quoted_value\"\nexport KEY2='single_quoted'\n",
      });

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { input: { key: "KEY1", value: "quoted_value", isSecret: false } },
      });

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "3" } } },
        expectVariables: { input: { key: "KEY2", value: "single_quoted", isSecret: false } },
      });

      await vars.run(testCtx, makeVarsArgs("import", `--from-file=${envFilePath}`, "--all"));

      expectStdout().toContain("Imported KEY1, KEY2");
    });

    it("skips comments and blank lines", async () => {
      await makeSyncScenario();

      const envFilePath = testDirPath("test.env");
      await writeDir(testDirPath(), {
        "test.env": "# this is a comment\n\nKEY1=value1\n# another comment\n",
      });

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { input: { key: "KEY1", value: "value1", isSecret: false } },
      });

      await vars.run(testCtx, makeVarsArgs("import", `--from-file=${envFilePath}`, "--all"));

      expectStdout().toContain("Imported KEY1");
    });

    it("imports specific keys from file", async () => {
      await makeSyncScenario();

      const envFilePath = testDirPath("test.env");
      await writeDir(testDirPath(), { "test.env": "KEY1=val1\nKEY2=val2\nKEY3=val3\n" });

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { input: { key: "KEY1", value: "val1", isSecret: false } },
      });

      await vars.run(testCtx, makeVarsArgs("import", `--from-file=${envFilePath}`, "KEY1"));

      expectStdout().toContain("Imported KEY1");
    });

    it("errors when specified keys not found in file", async () => {
      await makeSyncScenario();

      const envFilePath = testDirPath("test.env");
      await writeDir(testDirPath(), { "test.env": "KEY1=val1\n" });

      const error = await expectError(() => vars.run(testCtx, makeVarsArgs("import", `--from-file=${envFilePath}`, "MISSING")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("MISSING");
    });
  });

  describe("import validation", () => {
    it("errors when neither --from nor --from-file provided", async () => {
      await makeSyncScenario();

      const error = await expectError(() => vars.run(testCtx, makeVarsArgs("import", "--all")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("--from or --from-file");
    });

    it("errors when both --from and --from-file provided", async () => {
      await makeSyncScenario();

      const error = await expectError(() => vars.run(testCtx, makeVarsArgs("import", "--from=staging", "--from-file=.env")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Cannot use both");
    });

    it("errors when no keys specified and --all not used", async () => {
      await makeSyncScenario();

      const error = await expectError(() => vars.run(testCtx, makeVarsArgs("import", "--from=staging")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("--all");
    });
  });

  describe("help/usage", () => {
    it("prints help when no subcommand is given", async () => {
      await vars.run(testCtx, makeVarsArgs());

      expectStdout().toContain("ggt var <command>");
      expectStdout().toContain("list");
      expectStdout().toContain("set");
      expectStdout().toContain("delete");
    });

    it("prints help for list -h", async () => {
      await expectProcessExit(() => vars.run(testCtx, makeVarsArgs("list", "-h")));

      expectStdout().toContain("ggt var list");
    });

    it("prints help for set -h", async () => {
      await expectProcessExit(() => vars.run(testCtx, makeVarsArgs("set", "-h")));

      expectStdout().toContain("ggt var set");
      expectStdout().toContain("--secret");
    });

    it("prints help for delete -h", async () => {
      await expectProcessExit(() => vars.run(testCtx, makeVarsArgs("delete", "-h")));

      expectStdout().toContain("ggt var delete");
      expectStdout().toContain("--force");
    });

    it("prints help for import -h", async () => {
      await expectProcessExit(() => vars.run(testCtx, makeVarsArgs("import", "-h")));

      expectStdout().toContain("ggt var import");
      expectStdout().toContain("--from");
    });
  });

  describe("unknown subcommand", () => {
    it("errors on unknown subcommand", async () => {
      await makeSyncScenario();

      const error = await expectError(() => vars.run(testCtx, makeVarsArgs("bogus")));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("Unknown subcommand");
    });
  });
});
