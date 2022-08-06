import Whoami from "../../src/commands/whoami";
import { logger } from "../../src/lib/logger";

describe("Whoami", () => {
  it("logs the current user", async () => {
    jest.spyOn(Whoami.prototype, "getCurrentUser").mockResolvedValue({ email: "test@example.com", name: "Jane Doe" });

    await Whoami.run();

    expect(Whoami.prototype.getCurrentUser).toHaveBeenCalled();
    expect(logger.info).toHaveBeenLastCalledWith("You are logged in as Jane Doe (test@example.com)");
  });

  it("logs only the email if the current user's name is missing", async () => {
    jest.spyOn(Whoami.prototype, "getCurrentUser").mockResolvedValue({ email: "test@example.com" });

    await Whoami.run();

    expect(Whoami.prototype.getCurrentUser).toHaveBeenCalled();
    expect(logger.info).toHaveBeenLastCalledWith("You are logged in as test@example.com");
  });

  it("logs nothing if the current user is undefined", async () => {
    jest.spyOn(Whoami.prototype, "getCurrentUser").mockResolvedValue(undefined);

    await Whoami.run();

    expect(Whoami.prototype.getCurrentUser).toHaveBeenCalled();
    expect(logger.info).toHaveBeenLastCalledWith("You are not logged in");
  });
});
