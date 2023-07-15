import { describe, expect, it, vi } from "vitest";
import Login from "../../src/commands/login.js";
import { BaseCommand } from "../../src/services/base-command.js";

describe("Login", () => {
  it("delegates to BaseCommand.login", async () => {
    vi.spyOn(BaseCommand.prototype, "login").mockResolvedValue();

    await Login.run();

    expect(BaseCommand.prototype.login).toHaveBeenCalled();
  });
});
