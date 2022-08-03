import { Config as OclifConfig } from "@oclif/core";
import Login from "../../src/commands/login";
import { Api } from "../../src/lib/api";

describe("login", () => {
  let oclifConfig: OclifConfig;

  beforeEach(async () => {
    oclifConfig = (await OclifConfig.load()) as OclifConfig;
  });

  it("delegates to Api.login", async () => {
    jest.spyOn(Api, "login").mockResolvedValue();

    await new Login([], oclifConfig).run();

    expect(Api.login).toHaveBeenCalled();
  });
});
