import { beforeEach, describe, it } from "vitest";
import { run as list } from "../../src/commands/list.js";
import * as app from "../../src/services/app/app.js";
import { type Context } from "../../src/services/command/context.js";
import { output } from "../../src/services/output/output.js";
import { nockTestApps } from "../__support__/app.js";
import { makeContext } from "../__support__/context.js";
import { mock, mockOnce } from "../__support__/mock.js";
import { expectStdout } from "../__support__/output.js";
import { loginTestUser } from "../__support__/user.js";

describe("list", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = makeContext();
    loginTestUser();
    nockTestApps();
  });

  it("lists apps with tabs when output.isInteractive = true", async () => {
    mockOnce(output, "isInteractive", "get", () => true);

    await list(ctx);

    expectStdout().toMatchInlineSnapshot(`
      "Name                      Domain
      test                      test.gadget.app
      test2                     test2.gadget.app
      test-with-2-environments  test-with-2-environments.gadget.app
      test-with-0-environments  test-with-0-environments.gadget.app
      "
    `);
  });

  it("lists apps with tabs when output.isInteractive = false", async () => {
    mockOnce(output, "isInteractive", "get", () => false);

    await list(ctx);

    expectStdout().toMatchInlineSnapshot(`
      "test	test.gadget.app
      test2	test2.gadget.app
      test-with-2-environments	test-with-2-environments.gadget.app
      test-with-0-environments	test-with-0-environments.gadget.app
      "
    `);
  });

  it("lists no apps if the user doesn't have any", async () => {
    mock(app, "getApps", () => []);

    await list(ctx);

    expectStdout().toMatchInlineSnapshot(`
      "It doesn't look like you have any applications.

      Visit https://gadget.new to create one!
      "
    `);
  });
});
