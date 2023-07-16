import { describe, expect, it, vi } from "vitest";
import { run } from "../../src/commands/logout.js";
import { context } from "../../src/services/context.js";
import { expectStdout } from "../util.js";

describe("logout", () => {
  it("sets context.session = undefined", () => {
    context.session = "test";
    const spy = vi.spyOn(context, "session", "set");

    run();

    expect(spy).toHaveBeenLastCalledWith(undefined);
    expect(context.session).toBeUndefined();
  });

  it("prints a message if the user is logged in", () => {
    context.session = "test";

    run();

    expectStdout().toMatchInlineSnapshot(`
      "Goodbye
      "
    `);
  });

  it("prints a different message if the user is logged out", () => {
    context.session = undefined;

    run();

    expectStdout().toMatchInlineSnapshot(`
      "You are not logged in
      "
    `);
  });
});
