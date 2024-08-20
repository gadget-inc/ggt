import { beforeEach, describe, expect, it } from "vitest";
import { run } from "../../src/commands/logout.js";
import { type Context } from "../../src/services/command/context.js";
import { readSession, writeSession } from "../../src/services/user/session.js";
import { makeContext, testCtx } from "../__support__/context.js";
import { expectStdout } from "../__support__/output.js";

describe("logout", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = makeContext();
  });

  it("deletes the session from disk", async () => {
    writeSession(testCtx, "test");
    expect(readSession(testCtx)).toBe("test");

    await run(ctx);

    expect(readSession(testCtx)).toBeUndefined();
  });

  it("prints a message if the user is logged in", async () => {
    writeSession(testCtx, "test");

    await run(ctx);

    expectStdout().toMatchInlineSnapshot(`
      "Goodbye
      "
    `);
  });

  it("prints a different message if the user is logged out", async () => {
    writeSession(testCtx, undefined);

    await run(ctx);

    expectStdout().toMatchInlineSnapshot(`
      "You are not logged in
      "
    `);
  });
});
