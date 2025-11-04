import process from "node:process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as root from "../../src/commands/root.js";
import * as command from "../../src/services/command/command.js";
import { importCommand, type CommandModule } from "../../src/services/command/command.js";
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

describe("root", () => {
  beforeEach(() => {
    mock(process, "once", noopThis);

    // don't check for updates
    mock(update, "warnIfUpdateAvailable", noop);
  });

  afterEach(() => {
    expect(update.warnIfUpdateAvailable).toHaveBeenCalled();
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

      Usage
        ggt [COMMAND]

      Commands
        dev              Start developing your application
        deploy           Deploy your environment to production
        status           Show your local and environment's file changes
        push             Push your local files to your environment
        pull             Pull your environment's files to your local computer
        add              Add models, fields, actions and routes to your app
        open             Open a Gadget location in your browser
        list             List your available applications
        login            Log in to your account
        logout           Log out of your account
        logs             Stream your environment's logs
        debugger         Connect to the debugger for your environment
        whoami           Print the currently logged in account
        configure        Configure default execution options
        version          Print this version of ggt

      Flags
        -h, --help       Print how to use a command
        -v, --verbose    Print more verbose output
            --telemetry  Enable telemetry

      Run "ggt [COMMAND] -h" for more information about a specific command.
      "
    `);
  });

  it("prints out a helpful message when an unknown command is given", async () => {
    await expectProcessExit(() => root.run(testCtx, makeRootArgs("foobar")), 1);

    expectStdout().toMatchInlineSnapshot(`
      "Unknown command foobar

      Did you mean open?

      Run ggt --help for usage
      "
    `);
  });

  describe.each(command.Commands)("when %s is given", (name) => {
    let cmd: CommandModule;

    beforeEach(async () => {
      cmd = await importCommand(name);
      mock(cmd, "run", noop);
    });

    it.each(["--help", "-h"])("prints the usage when %s is passed", async (flag) => {
      await expectProcessExit(() => root.run(testCtx, makeRootArgs(name, flag)));

      expectStdout().toMatchSnapshot();
    });

    it("runs the command", async () => {
      await root.run(testCtx, makeRootArgs(name));

      expect(cmd.run).toHaveBeenCalled();
    });

    it("reports and exits if an error occurs", async () => {
      const error = new Error("boom!");
      mock(cmd, "run", () => {
        throw error;
      });

      void root.run(testCtx, makeRootArgs(name));
      await waitForReportErrorAndExit(error);

      expect(cmd.run).toHaveBeenCalled();
    });
  });
});
