import { describe, expect, it } from "vitest";
import { command } from "../../src/commands/logout.js";
import { readSession, writeSession } from "../../src/services/session.js";
import { expectStdout } from "../util.js";

describe("logout", () => {
  const rootArgs = { _: [] };

  it("deletes the session from disk", async () => {
    writeSession("test");
    expect(readSession()).toBe("test");

    await command(rootArgs);

    expect(readSession()).toBeUndefined();
  });

  it("prints a message if the user is logged in", async () => {
    writeSession("test");

    await command(rootArgs);

    expectStdout().toMatchInlineSnapshot(`
      "Goodbye
      "
    `);
  });

  it("prints a different message if the user is logged out", async () => {
    writeSession(undefined);

    await command(rootArgs);

    expectStdout().toMatchInlineSnapshot(`
      "You are not logged in
      "
    `);
  });
});
