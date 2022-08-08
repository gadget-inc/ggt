import Login from "../../src/commands/login";
import { BaseCommand } from "../../src/lib/base-command";

describe("Login", () => {
  it("delegates to BaseCommand.login", async () => {
    jest.spyOn(BaseCommand.prototype, "login").mockResolvedValue();

    await Login.run();

    expect(BaseCommand.prototype.login).toHaveBeenCalled();
  });
});
