import debug from "debug";
import _ from "lodash";
import { afterEach } from "node:test";
import { dedent } from "ts-dedent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { availableCommands, type Command } from "../../src/commands/index.js";
import { config } from "../../src/services/config.js";
import { CLIError, IsBug } from "../../src/services/errors.js";
import * as version from "../../src/services/version.js";
import { expectProcessExit, expectStdout } from "../util.js";

describe("root", () => {
  let run: () => Promise<void>;

  beforeEach(async () => {
    // don't check for updates
    vi.spyOn(version, "warnIfUpdateAvailable").mockResolvedValue();

    // mock the versionFull so that it doesn't change between releases, node versions, ci architectures, etc.
    // we have to mock this before importing root so that the top-level usage uses the mocked version
    vi.spyOn(config, "versionFull", "get").mockReturnValue("ggt/1.2.3 darwin-arm64 node-v16.0.0");

    ({ run } = await import("../../src/commands/root.js"));
  });

  afterEach(() => {
    expect(version.warnIfUpdateAvailable).toHaveBeenCalled();
  });

  it("enables debug when --debug is given", async () => {
    process.argv = ["node", "ggt", "--debug"];
    vi.spyOn(debug, "enable").mockImplementation(_.noop);

    await expectProcessExit(run);

    expect(debug.enable).toHaveBeenCalledWith(`ggt:*`);
  });

  it.each(["--version", "-v"])("prints the version when %s is given", async (flag) => {
    process.argv = ["node", "ggt", flag];
    vi.spyOn(config, "version", "get").mockReturnValue("1.2.3");

    await expectProcessExit(run);

    expectStdout().toEqual("1.2.3\n");
  });

  it("prints root usage when no command is given", async () => {
    process.argv = ["node", "ggt"];

    await expectProcessExit(run);

    expectStdout().toMatchInlineSnapshot(`
      "The command-line interface for Gadget

      VERSION
        ggt/1.2.3 darwin-arm64 node-v16.0.0

      USAGE
        $ ggt [COMMAND]

      FLAGS
        -h, --help     Print command's usage
        -v, --version  Print version
            --debug    Print debug output

      COMMANDS
        sync    Sync your Gadget application's source code to and
                from your local filesystem.
        list    List your apps.
        login   Log in to your account.
        logout  Log out of your account.
        whoami  Print the currently logged in account.
      "
    `);
  });

  it("prints out a helpful message when an unknown command is given", async () => {
    process.argv = ["node", "ggt", "foobar"];

    await expectProcessExit(run, 1);

    expectStdout().toMatchInlineSnapshot(`
      "Unknown command foobar

      Did you mean login?

      Run ggt --help for usage
      "
    `);
  });

  describe.each(availableCommands)("when %s is given", (name) => {
    let command: Command;

    beforeEach(async () => {
      command = await vi.importActual(`../../src/commands/${name}.js`);
      vi.spyOn(command, "run").mockImplementation(_.noop);
      if (command.init) {
        vi.spyOn(command, "init").mockImplementation(_.noop);
      }
    });

    it.each(["--help", "-h"])("prints the usage when %s is passed", async (flag) => {
      process.argv = ["node", "ggt", name, flag];

      await expectProcessExit(run);

      expectStdout().toEqual(command.usage + "\n");
    });

    it("runs the command", async () => {
      process.argv = ["node", "ggt", name];

      await run();

      if (command.init) {
        expect(command.init).toHaveBeenCalled();
      }
      expect(command.run).toHaveBeenCalled();
    });

    it("captures errors", async () => {
      class TestError extends CLIError {
        override isBug = IsBug.NO;

        constructor() {
          super("GGT_CLI_TEST_ERROR", "Boom!");
        }

        protected override body(): string {
          return this.message;
        }
      }

      const error = new TestError();
      vi.spyOn(error, "capture");

      process.argv = ["node", "ggt", name];
      vi.spyOn(command, "run").mockRejectedValue(error);

      await expectProcessExit(run, 1);

      expectStdout().toEqual(
        dedent`
          GGT_CLI_TEST_ERROR: Boom!

          Boom!\n
        `,
      );

      expect(error.capture).toHaveBeenCalled();
    });
  });
});
