import { describe, expect, it, vi } from "vitest";
import Whoami from "../../src/commands/whoami.js";
import { context } from "../../src/services/context.js";

describe("Whoami", () => {
  it("logs the current user", async () => {
    vi.spyOn(context, "getUser").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });

    await Whoami.run();

    expect(context.getUser).toHaveBeenCalled();
    expect(Whoami.prototype.log.mock.lastCall?.[0]).toMatchInlineSnapshot(`"You are logged in as Jane Doe (test@example.com)"`);
  });

  it("logs only the email if the current user's name is missing", async () => {
    vi.spyOn(context, "getUser").mockResolvedValue({ id: 1, email: "test@example.com" });

    await Whoami.run();

    expect(context.getUser).toHaveBeenCalled();
    expect(Whoami.prototype.log).toHaveBeenLastCalledWith("You are logged in as test@example.com");
  });

  it("logs nothing if the current user is undefined", async () => {
    vi.spyOn(context, "getUser").mockResolvedValue(undefined);

    await Whoami.run();

    expect(context.getUser).toHaveBeenCalled();
    expect(Whoami.prototype.log).toHaveBeenLastCalledWith("You are not logged in");
  });
});
