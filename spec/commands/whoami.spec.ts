import { describe, expect, it, vi } from "vitest";
import { command } from "../../src/commands/whoami.js";
import * as user from "../../src/services/user/user.js";
import { expectStdout } from "../__support__/stdout.js";

describe("whoami", () => {
  const rootArgs = { _: [] };

  it("outputs the current user", async () => {
    vi.spyOn(user, "getUser").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });

    await command(rootArgs);

    expect(user.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "You are logged in as Jane Doe (test@example.com)
      "
    `);
  });

  it("outputs only the email if the current user's name is missing", async () => {
    vi.spyOn(user, "getUser").mockResolvedValue({ id: 1, email: "test@example.com" });

    await command(rootArgs);

    expect(user.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "You are logged in as test@example.com
      "
    `);
  });

  it("outputs 'not logged in' if the current user is undefined", async () => {
    vi.spyOn(user, "getUser").mockResolvedValue(undefined);

    await command(rootArgs);

    expect(user.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "You are not logged in
      "
    `);
  });
});
