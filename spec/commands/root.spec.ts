import process from "node:process";
import { inspect } from "node:util";
import { afterEach, assert, beforeEach, describe, expect, it, vi } from "vitest";
import { spyOnImplementing } from "vitest-mock-process";
import { command as root } from "../../src/commands/root.js";
import * as command from "../../src/services/command/command.js";
import { importCommand, type CommandSpec } from "../../src/services/command/command.js";
import { config } from "../../src/services/config/config.js";
import { Level } from "../../src/services/output/log/level.js";
import * as update from "../../src/services/output/update.js";
import { noop, noopThis, type AnyFunction } from "../../src/services/util/function.js";
import { isAbortError } from "../../src/services/util/is.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import { withEnv } from "../__support__/env.js";
import { expectReportErrorAndExit } from "../__support__/error.js";
import { expectProcessExit } from "../__support__/process.js";
import { expectStdout } from "../__support__/stream.js";
import { mockVersion } from "../__support__/version.js";

describe("root", () => {
  mockVersion();

  beforeEach(() => {
    spyOnImplementing(process, "once", noopThis);

    // don't check for updates
    vi.spyOn(update, "warnIfUpdateAvailable").mockResolvedValue();
  });

  afterEach(() => {
    expect(update.warnIfUpdateAvailable).toHaveBeenCalled();
  });

  it("prints root usage when no command is given", async () => {
    process.argv = ["node", "ggt"];

    await expectProcessExit(root);

    expectStdout().toMatchInlineSnapshot(`
      "The command-line interface for Gadget

      USAGE
        ggt [COMMAND]

      COMMANDS
        sync           Sync your Gadget application's source code
        deploy         Deploy your app to production
        list           List your apps
        login          Log in to your account
        logout         Log out of your account
        whoami         Print the currently logged in account
        version        Print the version of ggt

      FLAGS
        -h, --help     Print command's usage
        -v, --verbose  Print verbose output
            --json     Print output as JSON

      For more information on a specific command, use 'ggt [COMMAND] --help'
      "
    `);
  });

  it("prints out a helpful message when an unknown command is given", async () => {
    process.argv = ["node", "ggt", "foobar"];

    await expectProcessExit(root, 1);

    expectStdout().toMatchInlineSnapshot(`
      "Unknown command foobar

      Did you mean login?

      Run ggt --help for usage
      "
    `);
  });

  it("sets GGT_LOG_FORMAT=json when --json is given", async () => {
    await withEnv({ GGT_LOG_FORMAT: undefined }, async () => {
      expect(config.logFormat).toBe("pretty");

      process.argv = ["node", "ggt", "--json"];
      await expectProcessExit(root);

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
      await expectProcessExit(root);

      expect(process.env["GGT_LOG_LEVEL"]).toBe(String(level));
      expect(config.logLevel).toBe(level);
    });
  });

  const signals = ["SIGINT", "SIGTERM"] as const;
  it.each(signals)("calls ctx.abort() on %s", async (expectedSignal) => {
    const aborted = new PromiseSignal();

    vi.spyOn(command, "isAvailableCommand").mockReturnValueOnce(true);
    vi.spyOn(command, "importCommand").mockResolvedValueOnce({
      usage: () => "abort test",
      command: (ctx) => {
        ctx.signal.addEventListener("abort", (reason) => {
          assert(isAbortError(reason), `reason isn't an AbortError: ${inspect(reason)}`);
          aborted.resolve();
        });
      },
    });

    let signalled = false;
    let onSignal: AnyFunction;

    spyOnImplementing(process, "once", (actualSignal, cb) => {
      signalled ||= actualSignal === expectedSignal;
      expect(signals).toContain(actualSignal);
      onSignal = cb;
      return process;
    });

    process.argv = ["node", "ggt", "test"];
    await root();

    expect(signalled).toBe(true);
    onSignal!();

    await aborted;
  });

  describe.each(command.AvailableCommands)("when %s is given", (name) => {
    let cmd: CommandSpec;

    beforeEach(async () => {
      cmd = await importCommand(name);
      vi.spyOn(cmd, "command").mockImplementation(noop);
    });

    it.each(["--help", "-h"])("prints the usage when %s is passed", async (flag) => {
      process.argv = ["node", "ggt", name, flag];

      await expectProcessExit(root);

      expectStdout().toEqual(cmd.usage() + "\n");
    });

    it("runs the command", async () => {
      process.argv = ["node", "ggt", name];

      await root();

      expect(cmd.command).toHaveBeenCalled();
    });

    it("reports and exits if an error occurs", async () => {
      const error = new Error("boom!");
      vi.spyOn(cmd, "command").mockRejectedValueOnce(error);

      process.argv = ["node", "ggt", name];

      void root();
      await expectReportErrorAndExit(error);

      expect(cmd.command).toHaveBeenCalled();
    });
  });
});
