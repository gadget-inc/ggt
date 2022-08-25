import Logout from "../../src/commands/logout";
import { session } from "../../src/lib/session";

describe("Logout", () => {
  it("calls session.set(undefined)", async () => {
    jest.spyOn(session, "set").mockImplementation();

    await Logout.run();

    expect(session.set).toHaveBeenLastCalledWith(undefined);
  });

  it("prints a message if the user is logged in", async () => {
    jest.spyOn(session, "set").mockReturnValue(true);

    await Logout.run();

    expect(Logout.prototype.log.mock.lastCall[0]).toMatchInlineSnapshot(`"Goodbye"`);
  });

  it("prints a different message if the user is logged out", async () => {
    jest.spyOn(session, "set").mockReturnValue(false);

    await Logout.run();

    expect(Logout.prototype.log.mock.lastCall[0]).toMatchInlineSnapshot(`"You are not logged in"`);
  });
});
