import Logout from "../../src/commands/logout";
import { BaseCommand } from "../../src/lib/base-command";

describe("Logout", () => {
  it("delegates to BaseCommand.logout", async () => {
    jest.spyOn(BaseCommand.prototype, "logout").mockImplementation();

    await Logout.run();

    expect(BaseCommand.prototype.logout).toHaveBeenCalled();
  });

  it("prints a message if the user is logged in", async () => {
    jest.spyOn(BaseCommand.prototype, "logout").mockReturnValue(true);

    await Logout.run();

    expect(Logout.prototype.log.mock.lastCall[0]).toMatchInlineSnapshot(`"Goodbye"`);
  });

  it("prints a different message if the user is logged out", async () => {
    jest.spyOn(BaseCommand.prototype, "logout").mockReturnValue(false);

    await Logout.run();

    expect(Logout.prototype.log.mock.lastCall[0]).toMatchInlineSnapshot(`"You are not logged in"`);
  });
});
