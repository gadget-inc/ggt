import Login from "../../src/commands/login.js";
import { BaseCommand } from "../../src/utils/base-command.js";
import { describe, it, expect, vi } from "vitest";

describe("Login", () => {
  it("delegates to BaseCommand.login", async () => {
    vi.spyOn(BaseCommand.prototype, "login").mockResolvedValue();

    await Login.run();

    expect(BaseCommand.prototype.login).toHaveBeenCalled();
  });
});
