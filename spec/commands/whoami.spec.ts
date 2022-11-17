import Whoami from "../../src/commands/whoami";
import { context } from "../../src/utils/context";

describe("Whoami", () => {
  it("logs the current user", async () => {
    jest.spyOn(context, "getUser").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });

    await Whoami.run();

    expect(context.getUser).toHaveBeenCalled();
    expect(Whoami.prototype.log).toHaveBeenLastCalledWith("You are logged in as Jane Doe (test@example.com)");
  });

  it("logs only the email if the current user's name is missing", async () => {
    jest.spyOn(context, "getUser").mockResolvedValue({ id: 1, email: "test@example.com" });

    await Whoami.run();

    expect(context.getUser).toHaveBeenCalled();
    expect(Whoami.prototype.log).toHaveBeenLastCalledWith("You are logged in as test@example.com");
  });

  it("logs nothing if the current user is undefined", async () => {
    jest.spyOn(context, "getUser").mockResolvedValue(undefined);

    await Whoami.run();

    expect(context.getUser).toHaveBeenCalled();
    expect(Whoami.prototype.log).toHaveBeenLastCalledWith("You are not logged in");
  });
});
