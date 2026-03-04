import { describe, expect, it } from "vitest";

import logout from "../../src/commands/logout.js";
import { runCommand } from "../../src/services/command/run.js";
import { readSession, writeSession } from "../../src/services/user/session.js";
import { testCtx } from "../__support__/context.js";
import { expectStdout } from "../__support__/output.js";

describe("logout", () => {
  it("deletes the session from disk", async () => {
    writeSession(testCtx, "test");
    expect(readSession(testCtx)).toBe("test");

    await runCommand(testCtx, logout);

    expect(readSession(testCtx)).toBeUndefined();
  });

  it("prints a message if the user is logged in", async () => {
    writeSession(testCtx, "test");

    await runCommand(testCtx, logout);

    expectStdout().toMatchInlineSnapshot(`
      "Goodbye
      "
    `);
  });

  it("prints a different message if the user is logged out", async () => {
    writeSession(testCtx, undefined);

    await runCommand(testCtx, logout);

    expectStdout().toMatchInlineSnapshot(`
      "You are not logged in
      "
    `);
  });
});
