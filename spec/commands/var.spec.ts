import { GraphQLError } from "graphql";
import { beforeEach, describe, expect, it } from "vitest";

import vars from "../../src/commands/var.js";
import {
  DELETE_ENVIRONMENT_VARIABLE_MUTATION,
  ENVIRONMENT_VARIABLES_QUERY,
  SET_ENVIRONMENT_VARIABLE_MUTATION,
} from "../../src/services/app/edit/operation.js";
import { FlagError } from "../../src/services/command/flag.js";
import { runCommand } from "../../src/services/command/run.js";
import { confirm } from "../../src/services/output/confirm.js";
import { nockTestApps, testApp } from "../__support__/app.js";
import { testCtx } from "../__support__/context.js";
import { expectError } from "../__support__/error.js";
import { writeDir } from "../__support__/files.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { nockEditResponse } from "../__support__/graphql.js";
import { mockConfirmOnce } from "../__support__/mock.js";
import { expectStdout } from "../__support__/output.js";
import { testDirPath } from "../__support__/paths.js";
import { loginTestUser } from "../__support__/user.js";

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

      await runCommand(testCtx, vars, "list");

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

      await runCommand(testCtx, vars, "list");

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

      await runCommand(testCtx, vars, "get", "DATABASE_URL");

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

      const error = await expectError(() => runCommand(testCtx, vars, "get", "API_KEY"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toMatchInlineSnapshot(`"API_KEY is a secret and its value cannot be read"`);
    });

    it("errors when variable not found", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: ENVIRONMENT_VARIABLES_QUERY,
        response: { data: { environmentVariables: [] } },
      });

      const error = await expectError(() => runCommand(testCtx, vars, "get", "MISSING_KEY"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toMatchInlineSnapshot(`"Environment variable not found: MISSING_KEY"`);
    });

    it("errors when no key argument provided", async () => {
      await makeSyncScenario();

      const error = await expectError(() => runCommand(testCtx, vars, "get"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toMatchInlineSnapshot(`"Missing required argument: key"`);
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

      await runCommand(testCtx, vars, "set", "API_KEY=abc123");

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

      await runCommand(testCtx, vars, "set", "KEY1=val1", "KEY2=val2");

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

      await runCommand(testCtx, vars, "set", "--secret", "SECRET=xyz");

      expectStdout().toContain("SECRET");
    });

    it("handles values with = signs", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { input: { key: "URL", value: "postgres://host?opt=val", isSecret: false } },
      });

      await runCommand(testCtx, vars, "set", "URL=postgres://host?opt=val");

      expectStdout().toContain("URL");
    });

    it("handles empty values", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: SET_ENVIRONMENT_VARIABLE_MUTATION,
        response: { data: { setEnvironmentVariable: { remoteFilesVersion: "2" } } },
        expectVariables: { input: { key: "EMPTY", value: "", isSecret: false } },
      });

      await runCommand(testCtx, vars, "set", "EMPTY=");

      expectStdout().toContain("EMPTY");
    });

    it("errors on bad format (no =)", async () => {
      await makeSyncScenario();

      const error = await expectError(() => runCommand(testCtx, vars, "set", "INVALID_FORMAT"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toMatchInlineSnapshot(`
        "Invalid format: INVALID_FORMAT

        Expected format: KEY=value"
      `);
    });

    it("errors on empty key (=value)", async () => {
      await makeSyncScenario();

      const error = await expectError(() => runCommand(testCtx, vars, "set", "=value"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toMatchInlineSnapshot(`
        "Invalid format: =value

        Expected format: KEY=value"
      `);
    });

    it("errors when no key=value provided", async () => {
      await makeSyncScenario();

      const error = await expectError(() => runCommand(testCtx, vars, "set"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toMatchInlineSnapshot(`"Missing required argument: key=value"`);
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

      await runCommand(testCtx, vars, "delete", "API_KEY");

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

      await runCommand(testCtx, vars, "delete", "--force", "API_KEY");

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

      await runCommand(testCtx, vars, "delete", "--all");

      expect(confirm).toHaveBeenCalledTimes(1);
      expectStdout().toContain("Deleted KEY1, KEY2");
    });

    it("handles --all with no variables", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: ENVIRONMENT_VARIABLES_QUERY,
        response: { data: { environmentVariables: [] } },
      });

      await runCommand(testCtx, vars, "delete", "--all");

      expectStdout().toContain("No environment variables to delete.");
    });

    it("--force suppresses not-found errors", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: DELETE_ENVIRONMENT_VARIABLE_MUTATION,
        response: { errors: [new GraphQLError("Environment variable not found")] },
        expectVariables: { key: "NONEXISTENT" },
      });

      await runCommand(testCtx, vars, "delete", "--force", "NONEXISTENT");

      // key was not actually deleted, so no success message
      expectStdout().not.toContain("Deleted");
    });

    it("errors when no key provided and --all not used", async () => {
      await makeSyncScenario();

      const error = await expectError(() => runCommand(testCtx, vars, "delete"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toMatchInlineSnapshot(`"Missing required argument: key"`);
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

      await runCommand(testCtx, vars, "import", "--from=cool-environment-development", "DB_URL");

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

      await runCommand(testCtx, vars, "import", "--from=cool-environment-development", "--all");

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

      await runCommand(testCtx, vars, "import", "--from=cool-environment-development", "--include-values", "DB_URL");

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

      await runCommand(testCtx, vars, "import", "--from=cool-environment-development", "--include-values", "--all");

      expectStdout().toContain("Imported PUBLIC from cool-environment-development");
      expectStdout().toContain("Skipped secret variables");
      expectStdout().toContain("SECRET");
    });

    it("errors on unknown source environment", async () => {
      await makeSyncScenario();

      const error = await expectError(() => runCommand(testCtx, vars, "import", "--from=nonexistent", "--all"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toMatchInlineSnapshot(`
        "Unknown environment: nonexistent

        Available environments:
          • development
          • production
          • cool-environment-development
          • other-environment-development"
      `);
    });

    it("errors when specified keys not found in source", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: ENVIRONMENT_VARIABLES_QUERY,
        response: { data: { environmentVariables: [] } },
        environment: { ...testApp.environments[2]!, application: testApp },
      });

      const error = await expectError(() => runCommand(testCtx, vars, "import", "--from=cool-environment-development", "MISSING"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toMatchInlineSnapshot(`
        "The following keys were not found in the cool-environment-development environment:

          • MISSING"
      `);
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

      await runCommand(testCtx, vars, "import", `--from-file=${envFilePath}`, "--all");

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

      await runCommand(testCtx, vars, "import", `--from-file=${envFilePath}`, "--all");

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

      await runCommand(testCtx, vars, "import", `--from-file=${envFilePath}`, "--all");

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

      await runCommand(testCtx, vars, "import", `--from-file=${envFilePath}`, "KEY1");

      expectStdout().toContain("Imported KEY1");
    });

    it("errors when specified keys not found in file", async () => {
      await makeSyncScenario();

      const envFilePath = testDirPath("test.env");
      await writeDir(testDirPath(), { "test.env": "KEY1=val1\n" });

      const error = await expectError(() => runCommand(testCtx, vars, "import", `--from-file=${envFilePath}`, "MISSING"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toMatchInlineSnapshot(`
        "The following keys were not found in the file:

          • MISSING"
      `);
    });
  });

  describe("import validation", () => {
    it("errors when neither --from nor --from-file provided", async () => {
      await makeSyncScenario();

      const error = await expectError(() => runCommand(testCtx, vars, "import", "--all"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toMatchInlineSnapshot(`"Either --from or --from-file is required."`);
    });

    it("errors when both --from and --from-file provided", async () => {
      await makeSyncScenario();

      const error = await expectError(() => runCommand(testCtx, vars, "import", "--from=staging", "--from-file=.env"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toMatchInlineSnapshot(`"Cannot use both --from and --from-file."`);
    });

    it("errors when no keys specified and --all not used", async () => {
      await makeSyncScenario();

      const error = await expectError(() => runCommand(testCtx, vars, "import", "--from=staging"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toMatchInlineSnapshot(`"Specify keys to import or use --all to import all variables."`);
    });
  });

  describe("unknown subcommand", () => {
    it("errors on unknown subcommand", async () => {
      await makeSyncScenario();

      const error = await expectError(() => runCommand(testCtx, vars, "bogus"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toMatchInlineSnapshot(`
        "Unknown subcommand bogus

        Did you mean get?

        USAGE
          ggt var <command> [flags]

        Run ggt var -h for more information."
      `);
    });
  });
});
