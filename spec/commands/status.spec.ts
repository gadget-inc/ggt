import { beforeEach, describe, it } from "vitest";
import { args, command as status, type StatusArgs } from "../../src/commands/status.js";
import type { Context } from "../../src/services/command/context.js";
import { nockTestApps } from "../__support__/app.js";
import { makeContext } from "../__support__/context.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { expectStdout } from "../__support__/output.js";
import { mockSystemTime } from "../__support__/time.js";
import { loginTestUser } from "../__support__/user.js";

describe("status", () => {
  mockSystemTime();

  let ctx: Context<StatusArgs>;

  beforeEach(() => {
    loginTestUser();
    nockTestApps();

    ctx = makeContext({
      parse: args,
      argv: ["status"],
    });
  });

  it("prints the expected message when nothing has changed", async () => {
    await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
      },
    });

    await status(ctx);

    expectStdout().toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.gadget.app
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/graphql?environment=development
       Docs        https://docs.gadget.dev/api/test

      ⠙ Calculating file changes.

      ✔ Your files are up to date. 12:00:00 AM
      "
    `);
  });

  it("prints the expected message when local files have changed", async () => {
    await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
        "local-file.txt": "changed",
      },
    });

    await status(ctx);

    expectStdout().toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.gadget.app
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/graphql?environment=development
       Docs        https://docs.gadget.dev/api/test

      ⠙ Calculating file changes.

      ✔ Calculated file changes. 12:00:00 AM

      Your local files have changed.
      +  local-file.txt  created

      Your environment's files have not changed.
      "
    `);
  });

  it("prints the expected message when gadget files have changed", async () => {
    await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
      },
      gadgetFiles: {
        "gadget-file.txt": "changed",
      },
    });

    await status(ctx);

    expectStdout().toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.gadget.app
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/graphql?environment=development
       Docs        https://docs.gadget.dev/api/test

      ⠙ Calculating file changes.

      ✔ Calculated file changes. 12:00:00 AM

      Your local files have not changed.

      Your environment's files have changed.
      +  gadget-file.txt  created
      "
    `);
  });

  it("prints the expected message when both local and gadget files have changed", async () => {
    await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
        "local-file.txt": "changed",
      },
      gadgetFiles: {
        "gadget-file.txt": "changed",
      },
    });

    await status(ctx);

    expectStdout().toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.gadget.app
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/graphql?environment=development
       Docs        https://docs.gadget.dev/api/test

      ⠙ Calculating file changes.

      ✔ Calculated file changes. 12:00:00 AM

      Your local files have changed.
      +  local-file.txt  created

      Your environment's files have changed.
      +  gadget-file.txt  created
      "
    `);
  });
});
