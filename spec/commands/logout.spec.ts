import { describe, expect, it, vi } from "vitest";
import { run } from "../../src/commands/logout.js";
import * as session from "../../src/services/session.js";
import { expectStdout } from "../util.js";

describe("logout", () => {
  it("sets context.session = undefined", () => {
    session.writeSession("test");
    const spy = vi.spyOn(session, "writeSession");

    run();

    expect(spy).toHaveBeenLastCalledWith(undefined);
    expect(session.readSession()).toBeUndefined();
  });

  it("prints a message if the user is logged in", () => {
    session.writeSession("test");

    run();

    expectStdout().toMatchInlineSnapshot(`
      "Goodbye
      "
    `);
  });

  it("prints a different message if the user is logged out", () => {
    session.writeSession(undefined);

    run();

    expectStdout().toMatchInlineSnapshot(`
      "You are not logged in
      "
    `);
  });
});
