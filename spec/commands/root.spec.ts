import assert from "node:assert";
import process from "node:process";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as root from "../../src/commands/root.js";
import * as command from "../../src/services/command/command.js";
import { importCommand, type CommandConfig, type ParentCommandConfig } from "../../src/services/command/command.js";
import { runCommand } from "../../src/services/command/run.js";
import { config } from "../../src/services/config/config.js";
import { Level } from "../../src/services/output/log/level.js";
import * as update from "../../src/services/output/update.js";
import { noop, noopThis } from "../../src/services/util/function.js";
import { makeRootArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { withEnv } from "../__support__/env.js";
import { waitForReportErrorAndExit } from "../__support__/error.js";
import { mock } from "../__support__/mock.js";
import { expectStdout } from "../__support__/output.js";
import { expectProcessExit } from "../__support__/process.js";

const parentCommands = new Set<string>();
const parentSubcommands = new Map<string, string[]>();
for (const name of command.Commands) {
  const cmd = await importCommand(name);
  if ("subcommands" in cmd) {
    parentCommands.add(name);
    parentSubcommands.set(name, Object.keys((cmd as ParentCommandConfig).subcommands));
  }
}

assert(parentCommands.size > 0, "parentCommands must not be empty — top-level await loop may have silently failed");

describe("root", () => {
  beforeEach(() => {
    process.argv = ["node", "ggt"];
    mock(process, "once", noopThis);

    // don't check for updates
    mock(update, "warnIfUpdateAvailable", noop);
  });

  it("sets GGT_LOG_FORMAT=json when --json is given", async () => {
    await withEnv({ GGT_LOG_FORMAT: undefined }, async () => {
      expect(config.logFormat).toBe("pretty");

      await expectProcessExit(() => root.run(testCtx, makeRootArgs("--json")));

      expect(process.env["GGT_LOG_FORMAT"]).toBe("json");
      expect(config.logFormat).toBe("json");
    });
  });

  it.each([
    [Level.INFO, "-v"],
    [Level.DEBUG, "-vv"],
    [Level.TRACE, "-vvv"],
  ])("sets GGT_LOG_LEVEL=%d when %s is given", async (level, flag) => {
    await withEnv({ GGT_LOG_LEVEL: undefined }, async () => {
      expect(config.logLevel).toBe(Level.PRINT);

      await expectProcessExit(() => root.run(testCtx, makeRootArgs(flag)));

      expect(process.env["GGT_LOG_LEVEL"]).toBe(String(level));
      expect(config.logLevel).toBe(level);
    });
  });

  it("prints root usage when no command is given", async () => {
    await expectProcessExit(() => root.run(testCtx, makeRootArgs()));

    expectStdout().toMatchInlineSnapshot(`
      "The command-line interface for Gadget.

      USAGE
        ggt [command]

      COMMANDS
        Development
        dev             Sync files and stream logs locally
        deploy          Deploy an environment to production
        push            Upload local file changes to Gadget
        pull            Download environment files to your local directory
        status          Show sync state and pending file changes
        logs            Stream logs from your app in real time
        debugger        Connect a debugger to your app's environment

        Resources
        add             Add resources to your app
        var             Manage your app's environment variables
        env             Manage your app's environments
        open            Open your app in a browser

        Account
        login           Log in to Gadget
        logout          Log out of Gadget
        whoami          Show the current logged-in user
        list            List your Gadget apps

        Diagnostics
        problems        Show errors and warnings in your app
        eval            Evaluate a JavaScript snippet against your app

        Configuration
        configure       Manage ggt configuration
        agent-plugin    Manage plugins for AI coding assistants
        version         Print the currently installed version

      FLAGS
        -h, --help       Show command help
            --version    Print the ggt version
        -v, --verbose    Increase output verbosity (-vv for debug, -vvv for trace)
            --telemetry  Enable telemetry
            --json       Output as JSON where supported

      Use -h for a summary, --help for full details.

      Documentation: https://docs.gadget.dev/guides/cli
      Issues:        https://github.com/gadget-inc/ggt/issues
      "
    `);
  });

  it("prints root usage when 'help' is given", async () => {
    await expectProcessExit(() => root.run(testCtx, makeRootArgs("help")));

    expectStdout().toMatchInlineSnapshot(`
      "The command-line interface for Gadget.

      USAGE
        ggt [command]

      COMMANDS
        Development
        dev             Sync files and stream logs locally
        deploy          Deploy an environment to production
        push            Upload local file changes to Gadget
        pull            Download environment files to your local directory
        status          Show sync state and pending file changes
        logs            Stream logs from your app in real time
        debugger        Connect a debugger to your app's environment

        Resources
        add             Add resources to your app
        var             Manage your app's environment variables
        env             Manage your app's environments
        open            Open your app in a browser

        Account
        login           Log in to Gadget
        logout          Log out of Gadget
        whoami          Show the current logged-in user
        list            List your Gadget apps

        Diagnostics
        problems        Show errors and warnings in your app
        eval            Evaluate a JavaScript snippet against your app

        Configuration
        configure       Manage ggt configuration
        agent-plugin    Manage plugins for AI coding assistants
        version         Print the currently installed version

      FLAGS
          -h, --help
                Show command help. Use -h for a compact summary. Use --help for expanded
                descriptions including flag details.

              --version
                Print the ggt version. Prints the currently installed ggt version string
                and exits. Same output as ggt version.

          -v, --verbose
                Increase output verbosity (-vv for debug, -vvv for trace). Each -v
                increases the log level: -v shows info messages, -vv enables debug
                output, and -vvv enables full trace logging.

              --telemetry
                Enable telemetry. Sends anonymous error reports to help improve ggt.
                Enabled by default. Use ggt configure to persist this setting.

              --json
                Output as JSON where supported. Formats all output as newline-delimited
                JSON instead of human-readable text. Useful for scripting and piping ggt
                output to other tools.

      Use -h for a summary, --help for full details.

      Documentation: https://docs.gadget.dev/guides/cli
      Issues:        https://github.com/gadget-inc/ggt/issues
      "
    `);
  });

  it("prints command usage when 'help <command>' is given", async () => {
    process.argv = ["node", "ggt", "help", "whoami"];
    await expectProcessExit(() => root.run(testCtx, makeRootArgs("help", "whoami")));

    expectStdout().toMatchInlineSnapshot(`
      "Show the current logged-in user

      Prints the name and email of the currently authenticated user. If no session
      is active, prints a not-logged-in message. Run ggt login to authenticate.

      USAGE
        ggt whoami

      EXAMPLES
        $ ggt whoami
      "
    `);
  });

  it("prints the version when --version is passed", async () => {
    await expectProcessExit(() => root.run(testCtx, makeRootArgs("--version")));

    expectStdout().toMatchInlineSnapshot(`
      "1.2.3
      "
    `);
  });

  it("prints out a helpful message when an unknown command is given", async () => {
    await expectProcessExit(() => root.run(testCtx, makeRootArgs("foobar")), 1);

    expectStdout().toMatchInlineSnapshot(`
      "Unknown command foobar

      Did you mean var?

      Run ggt --help for usage
      "
    `);
  });

  it("resolves 'envs' alias to the env command", async () => {
    const cmd = (await importCommand("env")) as ParentCommandConfig;
    mock(cmd.subcommands.list, "run", noop as never);

    await root.run(testCtx, makeRootArgs("envs", "list"));

    expect(cmd.subcommands.list.run).toHaveBeenCalled();
  });

  it("shows help when 'envs' alias is invoked without a subcommand", async () => {
    const cmd = await importCommand("env");
    // Call runCommand directly to bypass root.run's try-catch, which
    // catches the process.exit(0) mock throw and routes it to
    // reportErrorAndExit instead of letting it propagate.
    await expectProcessExit(() => runCommand(testCtx, cmd));

    expectStdout().toMatchInlineSnapshot(`
      "Manage your app's environments

      USAGE
        ggt env <command> [flags]

      COMMANDS
        list       List all environments
        create     Create a new environment
        delete     Delete an environment
        unpause    Unpause a paused environment
        use        Switch the active environment for this directory

      FLAGS
        -a, --app, --application <app-slug>  Gadget app to use

      EXAMPLES
        $ ggt env list
        $ ggt env create staging
        $ ggt env create staging --from development
        $ ggt env delete staging --force
        $ ggt env unpause staging
        $ ggt env use staging

      Run ggt env --help for more information.
      "
    `);
  });

  it("resolves 'problem' alias to the problems command", async () => {
    const cmd = await importCommand("problems");
    mock(cmd, "run", noop as never);

    await root.run(testCtx, makeRootArgs("problem"));

    expect(cmd.run).toHaveBeenCalled();
  });

  it("resolves 'log' alias to the logs command", async () => {
    const cmd = await importCommand("logs");
    mock(cmd, "run", noop as never);

    await root.run(testCtx, makeRootArgs("log"));

    expect(cmd.run).toHaveBeenCalled();
  });

  // ensure the alias resolves to the canonical command name before the
  // AllowedProdCommands check in AppIdentity.load, so "ggt log --env production" works
  it("passes args through to the resolved command when using an alias", async () => {
    const cmd = await importCommand("logs");
    mock(cmd, "run", noop as never);

    await root.run(testCtx, makeRootArgs("log", "--env", "production"));

    expect(cmd.run).toHaveBeenCalled();
  });

  describe.each(command.Commands)("when %s is given", (name) => {
    let cmd: CommandConfig;

    beforeEach(async () => {
      cmd = await importCommand(name);
      if ("run" in cmd) {
        mock(cmd, "run", noop as never);
      }
    });

    it.each(["--help", "-h"])("prints the usage when %s is passed", async (flag) => {
      process.argv = ["node", "ggt", name, flag];
      await expectProcessExit(() => root.run(testCtx, makeRootArgs(name, flag)));

      // toMatchSnapshot used because the parametrized loop generates one snapshot per command; inline would produce N large identical-structure blocks
      expectStdout().toMatchSnapshot();
    });

    // Parent commands exit via process.exit(0) before warnIfUpdateAvailable runs, so the assertion only applies to leaf commands.
    if (parentCommands.has(name)) {
      it("shows help when invoked without a subcommand", async () => {
        // Call dispatch directly to bypass root.run's try-catch, which
        // catches the process.exit(0) mock throw and routes it to
        // reportErrorAndExit instead of letting it propagate.
        await expectProcessExit(() => runCommand(testCtx, cmd));

        expectStdout().toMatchSnapshot();
      });

      const subNames = parentSubcommands.get(name)!;

      it.each(subNames.flatMap((sub) => [[sub, "-h"] as const, [sub, "--help"] as const]))(
        "prints the usage for %s when %s is passed",
        async (sub, flag) => {
          await expectProcessExit(() => runCommand(testCtx, cmd, sub, flag));
          expectStdout().toMatchSnapshot();
        },
      );
    } else {
      // Generate dummy values for required positionals so framework
      // validation passes and we actually reach command.run().
      const dummyPositionals = (): string[] => (cmd.positionals ?? []).filter((p) => p.required).map((p) => `test-${p.name}`);

      afterEach(() => {
        if ("run" in cmd) {
          expect(update.warnIfUpdateAvailable).toHaveBeenCalled();
        }
      });

      it("runs the command", async () => {
        await root.run(testCtx, makeRootArgs(name, ...dummyPositionals()));

        expect(cmd.run).toHaveBeenCalled();
      });

      it("reports and exits if an error occurs", async () => {
        const error = new Error("boom!");
        mock(cmd, "run", () => {
          throw error;
        });

        void root.run(testCtx, makeRootArgs(name, ...dummyPositionals()));
        await waitForReportErrorAndExit(error);

        expect(cmd.run).toHaveBeenCalled();
      });
    }
  });
});
