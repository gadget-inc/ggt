import process from "node:process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { command as root } from "../../src/commands/root.js";
import * as command from "../../src/services/command/command.js";
import { importCommand, type CommandModule } from "../../src/services/command/command.js";
import { config } from "../../src/services/config/config.js";
import { Level } from "../../src/services/output/log/level.js";
import * as update from "../../src/services/output/update.js";
import { noop, noopThis } from "../../src/services/util/function.js";
import { makeRootContext } from "../__support__/context.js";
import { withEnv } from "../__support__/env.js";
import { expectReportErrorAndExit } from "../__support__/error.js";
import { mock } from "../__support__/mock.js";
import { expectProcessExit } from "../__support__/process.js";
import { expectStdout } from "../__support__/stream.js";

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

      process.argv = ["node", "ggt", "--json"];
      await expectProcessExit(() => root(makeRootContext()));

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

      process.argv = ["node", "ggt", flag];
      await expectProcessExit(() => root(makeRootContext()));

      expect(process.env["GGT_LOG_LEVEL"]).toBe(String(level));
      expect(config.logLevel).toBe(level);
    });
  });

  it("prints root usage when no command is given", async () => {
    process.argv = ["node", "ggt"];

    await expectProcessExit(() => root(makeRootContext()));

    expectStdout().toMatchInlineSnapshot(`
      "The command-line interface for Gadget.

      USAGE
        ggt [COMMAND]

      COMMANDS
        sync           Sync your Gadget application's source code
        list           List your apps
        login          Log in to your account
        logout         Log out of your account
        whoami         Print the currently logged in account
        version        Print the version of ggt

      FLAGS
        -h, --help     Print command's usage
        -v, --verbose  Print verbose output
            --json     Print output as JSON

      Use \\"ggt [COMMAND] --help\\" for more information about a specific command.
      "
    `);
  });

  it("prints out a helpful message when an unknown command is given", async () => {
    process.argv = ["node", "ggt", "foobar"];

    await expectProcessExit(() => root(makeRootContext()), 1);

    expectStdout().toMatchInlineSnapshot(`
      "Unknown command foobar

      Did you mean login?

      Run ggt --help for usage
      "
    `);
  });

  describe.each(command.Commands)("when %s is given", (name) => {
    let cmd: CommandModule;

    beforeEach(async () => {
      cmd = await importCommand(name);
      mock(cmd, "command", noop);
    });

    it.each(["--help", "-h"])("prints the usage when %s is passed", async (flag) => {
      process.argv = ["node", "ggt", name, flag];

      await expectProcessExit(() => root(makeRootContext()));

      expectStdout().toMatchSnapshot();
    });

    it("runs the command", async () => {
      process.argv = ["node", "ggt", name];

      await root(makeRootContext());

      expect(cmd.command).toHaveBeenCalled();
    });

    it("reports and exits if an error occurs", async () => {
      const error = new Error("boom!");
      mock(cmd, "command", () => {
        throw error;
      });

      process.argv = ["node", "ggt", name];

      void root(makeRootContext());
      await expectReportErrorAndExit(error);

      expect(cmd.command).toHaveBeenCalled();
    });
  });
});
