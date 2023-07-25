import _ from "lodash";
import { dedent } from "ts-dedent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { availableCommands, type Command } from "../../src/commands/index.js";
import { run } from "../../src/commands/root.js";
import { config } from "../../src/services/config.js";
import { globalArgs } from "../../src/services/context.js";
import { CLIError, IsBug } from "../../src/services/errors.js";
import { expectProcessExit, expectStdout } from "../util.js";

describe("root", () => {
  it("prints root usage when no command is given", async () => {
    vi.spyOn(config, "versionFull", "get").mockReturnValue("ggt/1.2.3 darwin-arm64 node-v16.0.0");

    await expectProcessExit(run);

    expectStdout().toMatchInlineSnapshot(`
      "The command-line interface for Gadget

      VERSION
        ggt/0.2.3 darwin-arm64 node-v16.18.1

      USAGE
        $ ggt [COMMAND]

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
    globalArgs._.push("foobar");

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

    it("prints the usage when --help is passed", async () => {
      globalArgs._.push(name);
      globalArgs["--help"] = true;

      await expectProcessExit(run);

      expectStdout().toEqual(command.usage + "\n");
    });

    it("runs the command", async () => {
      globalArgs._.push(name);

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

      globalArgs._.push(name);
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
