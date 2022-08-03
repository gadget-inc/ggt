import { Config as OclifConfig } from "@oclif/core";
import Whoami from "../../src/commands/whoami";
import { Api } from "../../src/lib/api";
import { logger } from "../../src/lib/logger";

describe("whoami", () => {
  let oclifConfig: OclifConfig;

  beforeEach(async () => {
    oclifConfig = (await OclifConfig.load()) as OclifConfig;
  });

  it("logs the current user", async () => {
    jest.spyOn(Api, "getCurrentUser").mockResolvedValue({ email: "test@example.com", name: "Jane Doe" });

    await new Whoami([], oclifConfig).run();

    expect(Api.getCurrentUser).toHaveBeenCalled();
    expect(logger.info).toHaveBeenLastCalledWith("You are logged in as Jane Doe (test@example.com)");
  });

  it("logs only the email if the current user's name is missing", async () => {
    jest.spyOn(Api, "getCurrentUser").mockResolvedValue({ email: "test@example.com" });

    await new Whoami([], oclifConfig).run();

    expect(Api.getCurrentUser).toHaveBeenCalled();
    expect(logger.info).toHaveBeenLastCalledWith("You are logged in as test@example.com");
  });

  it("logs nothing if the current user is undefined", async () => {
    jest.spyOn(Api, "getCurrentUser").mockResolvedValue(undefined);

    await new Whoami([], oclifConfig).run();

    expect(Api.getCurrentUser).toHaveBeenCalled();
    expect(logger.info).toHaveBeenLastCalledWith("You are not logged in");
  });
});
