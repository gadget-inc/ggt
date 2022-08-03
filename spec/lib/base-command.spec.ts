import { Config as OclifConfig } from "@oclif/core";
import { prompt } from "inquirer";
import { Api } from "../../src/lib/api";
import { BaseCommand } from "../../src/lib/base-command";
import * as log from "../../src/lib/logger";

describe("BaseCommand", () => {
  let oclifConfig: OclifConfig;

  beforeEach(async () => {
    jest.spyOn(log, "configure").mockImplementation();
    oclifConfig = (await OclifConfig.load()) as OclifConfig;
  });

  describe("init", () => {
    // TODO: need to figure out global flag parsing
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("configures the logger's stdout log level", async () => {
      class Command extends BaseCommand {
        run = jest.fn();
      }

      await new Command(["--log-level", "error"], oclifConfig).init();

      expect(log.configure).toHaveBeenCalledWith({ stdout: "error" });
    });

    it("prompts the user to log in if the command requires a user", async () => {
      prompt.mockResolvedValue({ login: true });
      jest.spyOn(Api, "login").mockResolvedValue();
      jest.spyOn(BaseCommand.prototype, "exit").mockImplementation();

      class Command extends BaseCommand {
        override requireUser = true;
        run = jest.fn();
      }

      await new Command([], oclifConfig).init();

      expect(prompt).toHaveBeenCalled();
      expect(Api.login).toHaveBeenCalled();
      expect(BaseCommand.prototype.exit).not.toHaveBeenCalled();
    });

    it("exits if the user declines to log in", async () => {
      prompt.mockResolvedValue({ login: false });
      jest.spyOn(Api, "login").mockResolvedValue();
      jest.spyOn(BaseCommand.prototype, "exit").mockImplementation();

      class Command extends BaseCommand {
        override requireUser = true;
        run = jest.fn();
      }

      await new Command([], oclifConfig).init();

      expect(prompt).toHaveBeenCalled();
      expect(Api.login).not.toHaveBeenCalled();
      expect(BaseCommand.prototype.exit).toHaveBeenCalledWith(0);
    });

    it("does not prompt the user to log in if the command does not require a user", async () => {
      class Command extends BaseCommand {
        override requireUser = false;
        run = jest.fn();
      }

      await new Command([], oclifConfig).init();

      expect(prompt).not.toHaveBeenCalled();
    });
  });
});
