import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spyOnImplementing } from "vitest-mock-process";
import { AvailableCommands, importCommandModule, type CommandModule } from "../../src/commands/command.js";
import { command } from "../../src/commands/root.js";
import { config } from "../../src/services/config/config.js";
import { Level } from "../../src/services/output/log/level.js";
import * as update from "../../src/services/output/update.js";
import { noop, noopThis } from "../../src/services/util/function.js";
import { withEnv } from "../__support__/env.js";
import { expectProcessExit } from "../__support__/process.js";
import { expectStdout } from "../__support__/stdout.js";

describe("root", () => {
  beforeEach(() => {
    spyOnImplementing(process, "once", noopThis);

    // don't check for updates
    vi.spyOn(update, "warnIfUpdateAvailable").mockResolvedValue();

    // mock the versionFull so that it doesn't change between releases,
    // node versions, ci architectures, etc.
    vi.spyOn(config, "versionFull", "get").mockReturnValue("ggt/1.2.3 darwin-arm64 node-v16.0.0");
  });

  afterEach(() => {
    expect(update.warnIfUpdateAvailable).toHaveBeenCalled();
  });

  it("prints root usage when no command is given", async () => {
    process.argv = ["node", "ggt"];

    await expectProcessExit(command);

    expectStdout().toMatchInlineSnapshot(`
      "The command-line interface for Gadget

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

      For more information on a specific command, use 'ggt [COMMAND] --help'
      "
    `);
  });

  it("prints out a helpful message when an unknown command is given", async () => {
    process.argv = ["node", "ggt", "foobar"];

    await expectProcessExit(command, 1);

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
      await expectProcessExit(command);

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
      await expectProcessExit(command);

      expect(process.env["GGT_LOG_LEVEL"]).toBe(String(level));
      expect(config.logLevel).toBe(level);
    });
  });

  describe.each(AvailableCommands)("when %s is given", (name) => {
    let mod: CommandModule;

    beforeEach(async () => {
      mod = await importCommandModule(name);
      vi.spyOn(mod, "command").mockImplementation(noop);
    });

    it.each(["--help", "-h"])("prints the usage when %s is passed", async (flag) => {
      process.argv = ["node", "ggt", name, flag];

      await expectProcessExit(command);

      expectStdout().toEqual(mod.usage() + "\n");
    });

    it("runs the command", async () => {
      process.argv = ["node", "ggt", name];

      await command();

      expect(mod.command).toHaveBeenCalled();
    });
  });
});
