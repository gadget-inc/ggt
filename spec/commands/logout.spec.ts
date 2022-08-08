import { Config as OclifConfig } from "@oclif/core";
import Logout from "../../src/commands/logout";
import { Config } from "../../src/lib/config";
import { logger } from "../../src/lib/logger";

describe("Logout", () => {
  let oclifConfig: OclifConfig;

  beforeEach(async () => {
    oclifConfig = (await OclifConfig.load()) as OclifConfig;
  });

  it("deletes the Config's session", async () => {
    Config.session = "test";

    await new Logout([], oclifConfig).run();

    expect(Config.session).toBeUndefined();
    expect(Config.save).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("👋 goodbye!");
  });

  it("does not delete the Config's session if it is not set", async () => {
    Config.session = undefined;

    await new Logout([], oclifConfig).run();

    expect(logger.info).toHaveBeenCalledWith("You are not logged in");
    expect(Config.session).toBeUndefined();
    expect(Config.save).not.toHaveBeenCalled();
  });
});
