import { beforeEach, describe, expect, it, vi } from "vitest";

import { ArgError, type ArgsDefinition } from "../../../src/services/command/arg.js";
import { defineCommand } from "../../../src/services/command/command.js";
import { runCommand } from "../../../src/services/command/run.js";
import { noop } from "../../../src/services/util/function.js";
import { testCtx } from "../../__support__/context.js";
import { expectError } from "../../__support__/error.js";
import { expectStdout } from "../../__support__/output.js";
import { expectProcessExit } from "../../__support__/process.js";

// -- test fixtures --

const leafArgs = {
  "--force": { type: Boolean, alias: "-f", description: "Force the operation" },
} satisfies ArgsDefinition;

const leafRun = vi.fn();

const leafCommand = defineCommand({
  name: "test",
  description: "A test leaf command",
  args: leafArgs,
  run: leafRun,
});

const parentArgs = {
  "--app": { type: String, alias: "-a", description: "Select the application", valueName: "name" },
} satisfies ArgsDefinition;

const parentArgsWithVerbose = {
  "--app": { type: String, alias: "-a", description: "Select the application", valueName: "name" },
  "--verbose": { type: Boolean, alias: "-v", description: "Verbose output" },
} satisfies ArgsDefinition;

const listRun = vi.fn();
const getRun = vi.fn();

const parentCommand = defineCommand({
  name: "test",
  description: "A test parent command",
  args: parentArgs,
  subcommands: (sub) => ({
    list: sub({
      description: "List all items",
      aliases: ["ls"],
      run: listRun,
    }),
    get: sub({
      description: "Get a specific item",
      args: {
        "--id": { type: String, description: "Item ID", valueName: "id" },
      },
      run: getRun,
    }),
  }),
});

const verboseParentCommand = defineCommand({
  name: "test",
  description: "A test parent command",
  args: parentArgsWithVerbose,
  subcommands: (sub) => ({
    list: sub({
      description: "List all items",
      aliases: ["ls"],
      run: listRun,
    }),
    get: sub({
      description: "Get a specific item",
      args: {
        "--id": { type: String, description: "Item ID", valueName: "id" },
      },
      run: getRun,
    }),
  }),
});

describe("runCommand", () => {
  beforeEach(() => {
    leafRun.mockReset();
    listRun.mockReset();
    getRun.mockReset();
  });

  describe("routing", () => {
    it("routes to leaf run with parsed args", async () => {
      await runCommand(testCtx, leafCommand, "--force");

      expect(leafRun).toHaveBeenCalledWith(testCtx, expect.objectContaining({ "--force": true }));
    });

    it("routes to parent subcommand", async () => {
      await runCommand(testCtx, parentCommand, "list");

      expect(listRun).toHaveBeenCalled();
    });

    it("resolves aliases", async () => {
      await runCommand(testCtx, parentCommand, "ls");

      expect(listRun).toHaveBeenCalledWith(testCtx, expect.objectContaining({ _: [] }));
    });

    it("merges parent and subcommand args", async () => {
      await runCommand(testCtx, parentCommand, "get", "--app", "myapp", "--id", "42");

      expect(getRun).toHaveBeenCalledWith(
        testCtx,
        expect.objectContaining({
          "--app": "myapp",
          "--id": "42",
        }),
      );
    });

    it("routes when parent flags precede subcommand name", async () => {
      await runCommand(testCtx, parentCommand, "--app", "myapp", "list");

      expect(listRun).toHaveBeenCalledWith(testCtx, expect.objectContaining({ "--app": "myapp", _: [] }));
    });

    it("does not swallow subcommand name after boolean parent flag", async () => {
      await runCommand(testCtx, verboseParentCommand, "--verbose", "list");

      expect(listRun).toHaveBeenCalledWith(testCtx, expect.objectContaining({ "--verbose": true }));
    });

    it("identifies subcommand after --flag value pair", async () => {
      await runCommand(testCtx, parentCommand, "--app", "myapp", "get", "--id", "42");

      expect(getRun).toHaveBeenCalledWith(
        testCtx,
        expect.objectContaining({
          "--app": "myapp",
          "--id": "42",
        }),
      );
    });

    it("identifies subcommand after --flag=value", async () => {
      await runCommand(testCtx, parentCommand, "--app=myapp", "list");

      expect(listRun).toHaveBeenCalledWith(testCtx, expect.objectContaining({ "--app": "myapp" }));
    });

    it("identifies subcommand after alias flag with value", async () => {
      await runCommand(testCtx, parentCommand, "-a", "myapp", "list");

      expect(listRun).toHaveBeenCalledWith(testCtx, expect.objectContaining({ "--app": "myapp" }));
    });

    it("rest argv excludes the subcommand name token but preserves flags", async () => {
      await runCommand(testCtx, parentCommand, "--app", "myapp", "get", "--id", "42");

      expect(getRun).toHaveBeenCalledWith(
        testCtx,
        expect.objectContaining({
          "--app": "myapp",
          "--id": "42",
          _: [],
        }),
      );
    });

    it("passes extra positionals in _ array", async () => {
      await runCommand(testCtx, parentCommand, "get", "--id", "42", "extra");

      expect(getRun).toHaveBeenCalledWith(
        testCtx,
        expect.objectContaining({
          "--id": "42",
          _: ["extra"],
        }),
      );
    });

    it("resolves alias to canonical subcommand and calls its run", async () => {
      await runCommand(testCtx, parentCommand, "ls", "--app", "myapp");

      expect(listRun).toHaveBeenCalledWith(testCtx, expect.objectContaining({ "--app": "myapp" }));
      expect(getRun).not.toHaveBeenCalled();
    });

    it("treats tokens after -- as positionals, not flags", async () => {
      await runCommand(testCtx, leafCommand, "--", "--force");

      expect(leafRun).toHaveBeenCalledWith(testCtx, expect.objectContaining({ _: ["--force"] }));
      // --force is NOT set as a flag — it's a positional
      const args = leafRun.mock.calls[0]![1] as Record<string, unknown>;
      expect(args["--force"]).toBeUndefined();
    });
  });

  describe("help", () => {
    it("shows short help for leaf with -h", async () => {
      await expectProcessExit(() => runCommand(testCtx, leafCommand, "-h"), 0);

      expectStdout().toMatchInlineSnapshot(`
        "A test leaf command

        USAGE
          ggt test [flags]

        FLAGS
          -f, --force             Force the operation
        "
      `);
    });

    it("shows detailed help for leaf with --help", async () => {
      const detailedLeaf = defineCommand({
        name: "test",
        description: "A detailed leaf command",
        details: "This is a longer description\nwith multiple lines.",
        args: leafArgs,
        run: noop,
      });

      await expectProcessExit(() => runCommand(testCtx, detailedLeaf, "--help"), 0);

      expectStdout().toMatchInlineSnapshot(`
        "A detailed leaf command

        This is a longer description
        with multiple lines.

        USAGE
          ggt test [flags]

        FLAGS
          -f, --force
                Force the operation
        "
      `);
    });

    it("shows parent help when no subcommand given", async () => {
      await expectProcessExit(() => runCommand(testCtx, parentCommand), 0);

      expectStdout().toMatchInlineSnapshot(`
        "A test parent command

        USAGE
          ggt test <command> [flags]

        COMMANDS
          list    List all items
          get     Get a specific item

        FLAGS
          -a, --app <name>        Select the application
        "
      `);
    });

    it("shows short parent help with -h (no subcommand)", async () => {
      const detailedParent = defineCommand({
        name: "test",
        description: "A parent with detail",
        details: "Extended parent detail section.",
        args: parentArgs,
        subcommands: (sub) => ({
          list: sub({ description: "List items", run: listRun }),
        }),
      });

      await expectProcessExit(() => runCommand(testCtx, detailedParent, "-h"), 0);

      expectStdout().toMatchInlineSnapshot(`
        "A parent with detail

        USAGE
          ggt test <command> [flags]

        COMMANDS
          list    List items

        FLAGS
          -a, --app <name>        Select the application

        Run ggt test --help for more information.
        "
      `);
      expectStdout().not.toContain("Extended parent detail section.");
    });

    it("shows detailed parent help with --help (no subcommand)", async () => {
      const detailedParent = defineCommand({
        name: "test",
        description: "A parent with detail",
        details: "Extended parent detail section.",
        args: parentArgs,
        subcommands: (sub) => ({
          list: sub({ description: "List items", run: listRun }),
        }),
      });

      await expectProcessExit(() => runCommand(testCtx, detailedParent, "--help"), 0);

      expectStdout().toMatchInlineSnapshot(`
        "A parent with detail

        Extended parent detail section.

        USAGE
          ggt test <command> [flags]

        COMMANDS
          list    List items

        FLAGS
          -a, --app <name>
                Select the application
        "
      `);
    });

    it("shows subcommand help", async () => {
      await expectProcessExit(() => runCommand(testCtx, parentCommand, "get", "-h"), 0);

      expectStdout().toMatchInlineSnapshot(`
        "Get a specific item

        USAGE
          ggt test get [flags]

        FLAGS
          -a, --app <name>        Select the application
              --id <id>           Item ID
        "
      `);
    });

    it("shows short subcommand help when -h is in argv after subcommand name", async () => {
      const detailedParent = defineCommand({
        name: "test",
        description: "A parent with detailed sub",
        args: parentArgs,
        subcommands: (sub) => ({
          info: sub({
            description: "Show info",
            details: "Extended info detail section.",
            args: {
              "--verbose": { type: Boolean, description: "Verbose output" },
            },
            run: noop,
          }),
        }),
      });

      await expectProcessExit(() => runCommand(testCtx, detailedParent, "info", "-h"), 0);

      expectStdout().toMatchInlineSnapshot(`
        "Show info

        USAGE
          ggt test info [flags]

        FLAGS
          -a, --app <name>        Select the application
              --verbose           Verbose output

        Run ggt test info --help for more information.
        "
      `);
      expectStdout().not.toContain("Extended info detail section.");
    });

    it("does not trigger help when --help appears after --", async () => {
      await runCommand(testCtx, leafCommand, "--", "--help");

      expect(leafRun).toHaveBeenCalled();
    });

    it("does not false-positive -h on a flag value", async () => {
      await runCommand(testCtx, parentCommand, "--app=-h", "list");

      expect(listRun).toHaveBeenCalled();
    });

    it("does not treat -h as help when it follows a value-taking flag (space-separated)", async () => {
      // The arg parser rejects -h because it looks like a flag, not a
      // value for --app, so an ArgError is thrown instead of showing help.
      const error = await expectError(() => runCommand(testCtx, parentCommand, "--app", "-h", "list"));

      expect(error).toBeInstanceOf(ArgError);
      // crucially, it did NOT show help -- it routed to "list" and attempted to parse
      expect(error.message).toMatchInlineSnapshot(`"option requires argument: --app"`);
      expect(error.usageHintText).toMatchInlineSnapshot(`
        "USAGE
          ggt test list [flags]

        Run ggt test list -h for more information."
      `);
    });

    it("shows subcommand help when -h follows aliased subcommand name", async () => {
      await expectProcessExit(() => runCommand(testCtx, parentCommand, "ls", "-h"), 0);

      expectStdout().toMatchInlineSnapshot(`
        "List all items

        USAGE
          ggt test list [flags]

        FLAGS
          -a, --app <name>        Select the application
        "
      `);
    });

    it("shows subcommand help when -h precedes subcommand name", async () => {
      await expectProcessExit(() => runCommand(testCtx, parentCommand, "-h", "list"), 0);

      expectStdout().toMatchInlineSnapshot(`
        "List all items

        USAGE
          ggt test list [flags]

        FLAGS
          -a, --app <name>        Select the application
        "
      `);
    });

    it("shows parent help with merged args when subcommand has --help", async () => {
      await expectProcessExit(() => runCommand(testCtx, parentCommand, "get", "--help"), 0);

      expectStdout().toMatchInlineSnapshot(`
        "Get a specific item

        USAGE
          ggt test get [flags]

        FLAGS
          -a, --app <name>        Select the application
              --id <id>           Item ID
        "
      `);
    });

    it("shows parent help with -h even after a boolean flag like --verbose", async () => {
      await expectProcessExit(() => runCommand(testCtx, verboseParentCommand, "--verbose", "-h"), 0);

      expectStdout().toMatchInlineSnapshot(`
        "A test parent command

        USAGE
          ggt test <command> [flags]

        COMMANDS
          list    List all items
          get     Get a specific item

        FLAGS
          -a, --app <name>        Select the application
          -v, --verbose           Verbose output
        "
      `);
    });

    it("shows detailed subcommand help when --help is in argv after subcommand name", async () => {
      const detailedParent = defineCommand({
        name: "test",
        description: "A parent with detailed sub",
        args: parentArgs,
        subcommands: (sub) => ({
          info: sub({
            description: "Show info",
            details: "Extended info detail section.",
            args: {
              "--verbose": { type: Boolean, description: "Verbose output", details: "Show all available details\nin the output." },
            },
            run: noop,
          }),
        }),
      });

      await expectProcessExit(() => runCommand(testCtx, detailedParent, "info", "--help"), 0);

      expectStdout().toMatchInlineSnapshot(`
        "Show info

        Extended info detail section.

        USAGE
          ggt test info [flags]

        FLAGS
          -a, --app <name>
                Select the application

              --verbose
                Verbose output. Show all available details in the output.
        "
      `);
    });
  });

  describe("errors", () => {
    it("throws ArgError for unknown subcommand", async () => {
      const error = await expectError(() => runCommand(testCtx, parentCommand, "bogus"));

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`
        "Unknown subcommand bogus

        Did you mean get?

        USAGE
          ggt test <command> [flags]

        Run ggt test -h for more information."
      `);
    });

    it("throws ArgError for unknown subcommand when subcommands is empty", async () => {
      const emptyParent = defineCommand({
        name: "test",
        description: "A parent with no subcommands",
        subcommands: () => ({}),
      });

      const error = await expectError(() => runCommand(testCtx, emptyParent, "bogus"));

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`
        "Unknown subcommand bogus

        USAGE
          ggt test

        Run ggt test -h for more information."
      `);
      expect(error.message).not.toContain("Did you mean");
    });

    it("throws ArgError for unknown flag on leaf command", async () => {
      const error = await expectError(() => runCommand(testCtx, leafCommand, "--bogus"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`"unknown or unexpected option: --bogus"`);
      expect(error.usageHintText).toMatchInlineSnapshot(`
        "USAGE
          ggt test [flags]

        Run ggt test -h for more information."
      `);
    });

    it("unknown subcommand error includes Did you mean suggestion and usage hint", async () => {
      const error = await expectError(() => runCommand(testCtx, parentCommand, "lis"));

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`
        "Unknown subcommand lis

        Did you mean list?

        USAGE
          ggt test <command> [flags]

        Run ggt test -h for more information."
      `);
    });

    it("throws ArgError for unknown flag on subcommand", async () => {
      const error = await expectError(() => runCommand(testCtx, parentCommand, "get", "--bogus"));

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`"unknown or unexpected option: --bogus"`);
      expect(error.usageHintText).toMatchInlineSnapshot(`
        "USAGE
          ggt test get [flags]

        Run ggt test get -h for more information."
      `);
    });

    it("throws ArgError for missing required flag value", async () => {
      const error = await expectError(() => runCommand(testCtx, parentCommand, "get", "--id"));

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`"option requires argument: --id"`);
      expect(error.usageHintText).toMatchInlineSnapshot(`
        "USAGE
          ggt test get [flags]

        Run ggt test get -h for more information."
      `);
    });

    it("enriches ArgError with usage hint when usageHint is true (default)", async () => {
      const throwingCommand = defineCommand({
        name: "throwing",
        description: "A command that throws with usageHint",
        args: {
          "--name": { type: String, description: "A name", valueName: "name" },
        },
        run: () => {
          throw new ArgError("Missing required argument: name");
        },
      });

      const error = await expectError(() => runCommand(testCtx, throwingCommand));

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`"Missing required argument: name"`);
      expect(error.usageHintText).toMatchInlineSnapshot(`
        "USAGE
          ggt throwing [flags]

        Run ggt throwing -h for more information."
      `);
    });

    it("does not enrich ArgError when usageHint is false", async () => {
      const throwingCommand = defineCommand({
        name: "throwing",
        description: "A command that throws without usageHint",
        run: () => {
          throw new ArgError("Some validation error", { usageHint: false });
        },
      });

      const error = await expectError(() => runCommand(testCtx, throwingCommand));

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`"Some validation error"`);
      expect(error.message).not.toContain("USAGE");
      expect(error.message).not.toContain("-h");
    });
  });

  describe("required positional validation", () => {
    it("throws ArgError with usage hint when a required positional is missing on a leaf command", async () => {
      const cmd = defineCommand({
        name: "leaf-pos",
        description: "Leaf with required positional",
        positionals: [{ name: "file", required: true }],
        run: noop,
      });

      const error = await expectError(() => runCommand(testCtx, cmd));

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`"Missing required argument: file"`);
      expect(error.usageHintText).toMatchInlineSnapshot(`
        "USAGE
          ggt leaf-pos <file>

        Run ggt leaf-pos -h for more information."
      `);
    });

    it("passes when a required positional is provided on a leaf command", async () => {
      const run = vi.fn();
      const cmd = defineCommand({
        name: "leaf-pos",
        description: "Leaf with required positional",
        positionals: [{ name: "file", required: true }],
        run,
      });

      await runCommand(testCtx, cmd, "hello.txt");

      expect(run).toHaveBeenCalledWith(testCtx, expect.objectContaining({ _: ["hello.txt"] }));
    });

    it("passes when an optional positional is absent", async () => {
      const run = vi.fn();
      const cmd = defineCommand({
        name: "leaf-opt",
        description: "Leaf with optional positional",
        positionals: [{ name: "file" }],
        run,
      });

      await runCommand(testCtx, cmd);

      expect(run).toHaveBeenCalled();
    });

    it("errors on the first missing required positional when multiple are defined", async () => {
      const parentCmd = defineCommand({
        name: "multi",
        description: "Parent with multi-positional sub",
        subcommands: (sub) => ({
          route: sub({
            description: "Add route",
            positionals: [
              { name: "METHOD", required: true },
              { name: "path", required: true },
            ],
            run: noop,
          }),
        }),
      });

      const error = await expectError(() => runCommand(testCtx, parentCmd, "route"));

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`"Missing required argument: METHOD"`);
      expect(error.usageHintText).toMatchInlineSnapshot(`
        "USAGE
          ggt multi route <METHOD> <path>

        Run ggt multi route -h for more information."
      `);
    });

    it("errors on the second required positional when the first is provided", async () => {
      const parentCmd = defineCommand({
        name: "multi",
        description: "Parent with multi-positional sub",
        subcommands: (sub) => ({
          route: sub({
            description: "Add route",
            positionals: [
              { name: "METHOD", required: true },
              { name: "path", required: true },
            ],
            run: noop,
          }),
        }),
      });

      const error = await expectError(() => runCommand(testCtx, parentCmd, "route", "GET"));

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`"Missing required argument: path"`);
      expect(error.usageHintText).toMatchInlineSnapshot(`
        "USAGE
          ggt multi route <METHOD> <path>

        Run ggt multi route -h for more information."
      `);
    });

    it("throws ArgError with usage hint for missing required positional on a subcommand", async () => {
      const parentCmd = defineCommand({
        name: "resource",
        description: "Manage resources",
        args: {
          "--app": { type: String, description: "App name" },
        },
        subcommands: (sub) => ({
          get: sub({
            description: "Get a resource",
            positionals: [{ name: "KEY", required: true, description: "Resource key" }],
            run: noop,
          }),
        }),
      });

      const error = await expectError(() => runCommand(testCtx, parentCmd, "get"));

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`"Missing required argument: KEY"`);
      expect(error.usageHintText).toMatchInlineSnapshot(`
        "USAGE
          ggt resource get <KEY> [flags]

        Run ggt resource get -h for more information."
      `);
    });
  });
});
