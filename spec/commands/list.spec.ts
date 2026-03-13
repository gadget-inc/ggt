import { beforeEach, describe, it } from "vitest";

import list from "../../src/commands/list.ts";
import * as app from "../../src/services/app/app.ts";
import { runCommand } from "../../src/services/command/run.ts";
import { output } from "../../src/services/output/output.ts";
import { nockTestApps } from "../__support__/app.ts";
import { testCtx } from "../__support__/context.ts";
import { mock, mockOnce } from "../__support__/mock.ts";
import { expectStdout } from "../__support__/output.ts";
import { loginTestUser } from "../__support__/user.ts";

describe("list", () => {
  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  it("lists apps with tabs when output.isInteractive = true", async () => {
    mockOnce(output, "isInteractive", "get", () => true);

    await runCommand(testCtx, list);

    expectStdout().toMatchInlineSnapshot(`
      "first-test-team
      Name   Domain
      test   test.gadget.app
      test2  test2.gadget.app

      "
    `);
  });

  it("lists apps with tabs when output.isInteractive = false", async () => {
    mockOnce(output, "isInteractive", "get", () => false);

    await runCommand(testCtx, list);

    expectStdout().toMatchInlineSnapshot(`
      "test	test.gadget.app
      test2	test2.gadget.app
      "
    `);
  });

  it("lists no apps if the user doesn't have any", async () => {
    mock(app, "getApplications", () => []);

    await runCommand(testCtx, list);

    expectStdout().toMatchInlineSnapshot(`
      "It doesn't look like you have any applications.

      Visit https://gadget.new to create one!
      "
    `);
  });
});
