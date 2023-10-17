import { describe, expect, it } from "vitest";
import { run } from "../../src/commands/logout.js";
import { readSession, writeSession } from "../../src/services/session.js";
import { expectStdout } from "../util.js";

describe("logout", () => {
  it("deletes the session from disk", () => {
    writeSession("test");
    expect(readSession()).toBe("test");

    run();

    expect(readSession()).toBeUndefined();
  });

  it("prints a message if the user is logged in", () => {
    writeSession("test");

    run();

    expectStdout().toMatchInlineSnapshot(`
      "Goodbye
      "
    `);
  });

  it("prints a different message if the user is logged out", () => {
    writeSession(undefined);

    run();

    expectStdout().toMatchInlineSnapshot(`
      "You are not logged in
      "
    `);
  });
});
