import { beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../../src/commands/logout.js";
import { Context } from "../../src/services/context.js";
import { expectStdout } from "../util.js";

describe("logout", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = new Context();
  });

  it("sets context.session = undefined", () => {
    ctx.session = "test";
    const spy = vi.spyOn(ctx, "session", "set");

    run(ctx);

    expect(spy).toHaveBeenLastCalledWith(undefined);
    expect(ctx.session).toBeUndefined();
  });

  it("prints a message if the user is logged in", () => {
    ctx.session = "test";

    run(ctx);

    expectStdout().toMatchInlineSnapshot(`
      "Goodbye
      "
    `);
  });

  it("prints a different message if the user is logged out", () => {
    ctx.session = undefined;

    run(ctx);

    expectStdout().toMatchInlineSnapshot(`
      "You are not logged in
      "
    `);
  });
});
