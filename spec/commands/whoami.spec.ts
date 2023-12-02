import { beforeEach, describe, expect, it, vi } from "vitest";
import { command } from "../../src/commands/whoami.js";
import { Context } from "../../src/services/command/context.js";
import * as user from "../../src/services/user/user.js";
import { expectStdout } from "../__support__/stdout.js";

describe("whoami", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = new Context({ _: [] });
  });

  it("outputs the current user", async () => {
    vi.spyOn(user, "getUser").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });

    await command(ctx);

    expect(user.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "You are logged in as Jane Doe (test@example.com)
      "
    `);
  });

  it("outputs only the email if the current user's name is missing", async () => {
    vi.spyOn(user, "getUser").mockResolvedValue({ id: 1, email: "test@example.com" });

    await command(ctx);

    expect(user.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "You are logged in as test@example.com
      "
    `);
  });

  it("outputs 'not logged in' if the current user is undefined", async () => {
    vi.spyOn(user, "getUser").mockResolvedValue(undefined);

    await command(ctx);

    expect(user.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "You are not logged in
      "
    `);
  });
});
