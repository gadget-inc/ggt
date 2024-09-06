import { describe, expect, it } from "vitest";
import * as whoami from "../../src/commands/whoami.js";
import * as user from "../../src/services/user/user.js";
import { testCtx } from "../__support__/context.js";
import { mock } from "../__support__/mock.js";
import { expectStdout } from "../__support__/output.js";

describe("whoami", () => {
  it("outputs the current user", async () => {
    mock(user, "getUser", () => ({ id: 1, email: "test@example.com", name: "Jane Doe" }));

    await whoami.run(testCtx, { _: [] });

    expect(user.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "You are logged in as Jane Doe (test@example.com)
      "
    `);
  });

  it("outputs only the email if the current user's name is missing", async () => {
    mock(user, "getUser", () => ({ id: 1, email: "test@example.com" }));

    await whoami.run(testCtx, { _: [] });

    expect(user.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "You are logged in as test@example.com
      "
    `);
  });

  it("outputs 'not logged in' if the current user is undefined", async () => {
    mock(user, "getUser", () => undefined);

    await whoami.run(testCtx, { _: [] });

    expect(user.getUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "You are not logged in
      "
    `);
  });
});
