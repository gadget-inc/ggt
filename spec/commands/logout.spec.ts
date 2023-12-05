import { beforeEach, describe, expect, it } from "vitest";
import { command } from "../../src/commands/logout.js";
import { Context } from "../../src/services/command/context.js";
import { readSession, writeSession } from "../../src/services/user/session.js";
import { expectStdout } from "../__support__/stream.js";

describe("logout", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = new Context({ _: [] });
  });

  it("deletes the session from disk", async () => {
    writeSession("test");
    expect(readSession()).toBe("test");

    await command(ctx);

    expect(readSession()).toBeUndefined();
  });

  it("prints a message if the user is logged in", async () => {
    writeSession("test");

    await command(ctx);

    expectStdout().toMatchInlineSnapshot(`
      "Goodbye
      "
    `);
  });

  it("prints a different message if the user is logged out", async () => {
    writeSession(undefined);

    await command(ctx);

    expectStdout().toMatchInlineSnapshot(`
      "You are not logged in
      "
    `);
  });
});
