import { beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../../src/commands/whoami.js";
import { Context } from "../../src/services/context.js";
import { expectStdout } from "../util.js";

describe("whoami", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = new Context();
  });

  it("outputs the current user", async () => {
    vi.spyOn(ctx, "getUser").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });

    await run(ctx);

    expect(ctx.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "You are logged in as Jane Doe (test@example.com)
      "
    `);
  });

  it("outputs only the email if the current user's name is missing", async () => {
    vi.spyOn(ctx, "getUser").mockResolvedValue({ id: 1, email: "test@example.com" });

    await run(ctx);

    expect(ctx.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "You are logged in as test@example.com
      "
    `);
  });

  it("outputs 'not logged in' if the current user is undefined", async () => {
    vi.spyOn(ctx, "getUser").mockResolvedValue(undefined);

    await run(ctx);

    expect(ctx.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "You are not logged in
      "
    `);
  });
});
