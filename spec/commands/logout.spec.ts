import Logout from "../../src/commands/logout";
import { context } from "../../src/lib/context";

describe("Logout", () => {
  it("sets context.session = undefined", async () => {
    context.session = "test";
    const spy = jest.spyOn(context, "session", "set");

    await Logout.run();

    expect(spy).toHaveBeenLastCalledWith(undefined);
    expect(context.session).toBeUndefined();
  });

  it("prints a message if the user is logged in", async () => {
    context.session = "test";

    await Logout.run();

    expect(Logout.prototype.log.mock.lastCall?.[0]).toMatchInlineSnapshot(`"Goodbye"`);
  });

  it("prints a different message if the user is logged out", async () => {
    context.session = undefined;

    await Logout.run();

    expect(Logout.prototype.log.mock.lastCall?.[0]).toMatchInlineSnapshot(`"You are not logged in"`);
  });
});
