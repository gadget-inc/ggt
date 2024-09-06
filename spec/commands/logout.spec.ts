import { describe, expect, it } from "vitest";
import * as logout from "../../src/commands/logout.js";
import { readSession, writeSession } from "../../src/services/user/session.js";
import { makeRootArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { expectStdout } from "../__support__/output.js";

describe("logout", () => {
  it("deletes the session from disk", async () => {
    writeSession(testCtx, "test");
    expect(readSession(testCtx)).toBe("test");

    await logout.run(testCtx, makeRootArgs());

    expect(readSession(testCtx)).toBeUndefined();
  });

  it("prints a message if the user is logged in", async () => {
    writeSession(testCtx, "test");

    await logout.run(testCtx, makeRootArgs());

    expectStdout().toMatchInlineSnapshot(`
      "Goodbye
      "
    `);
  });

  it("prints a different message if the user is logged out", async () => {
    writeSession(testCtx, undefined);

    await logout.run(testCtx, makeRootArgs());

    expectStdout().toMatchInlineSnapshot(`
      "You are not logged in
      "
    `);
  });
});
