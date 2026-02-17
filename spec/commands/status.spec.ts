import { beforeEach, describe, expect, it } from "vitest";

import * as status from "../../src/commands/status.js";
import { ArgError } from "../../src/services/command/arg.js";
import { acquireDevLock } from "../../src/services/filesync/dev-lock.js";
import { UnknownDirectoryError } from "../../src/services/filesync/error.js";
import { SyncJson } from "../../src/services/filesync/sync-json.js";
import { nockTestApps } from "../__support__/app.js";
import { makeArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { expectError } from "../__support__/error.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { mock } from "../__support__/mock.js";
import { expectStdout } from "../__support__/output.js";
import { mockSystemTime } from "../__support__/time.js";
import { loginTestUser } from "../__support__/user.js";

describe("status", () => {
  mockSystemTime();

  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  it("prints the expected message when nothing has changed", async () => {
    await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
      },
    });

    await status.run(testCtx, makeArgs(status.args));

    expectStdout().toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.ggt.pub
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/javascript?environment=development
       Docs        https://docs.gadget.dev/api/test

      ggt dev is not running.

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

    await status.run(testCtx, makeArgs(status.args));

    expectStdout().toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.ggt.pub
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/javascript?environment=development
       Docs        https://docs.gadget.dev/api/test

      ggt dev is not running.

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

    await status.run(testCtx, makeArgs(status.args));

    expectStdout().toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.ggt.pub
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/javascript?environment=development
       Docs        https://docs.gadget.dev/api/test

      ggt dev is not running.

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

    await status.run(testCtx, makeArgs(status.args));

    expectStdout().toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.ggt.pub
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/javascript?environment=development
       Docs        https://docs.gadget.dev/api/test

      ggt dev is not running.

      ⠙ Calculating file changes.
      ✔ Calculated file changes. 12:00:00 AM

      Your local files have changed.
      +  local-file.txt  created

      Your environment's files have also changed.
      +  gadget-file.txt  created
      "
    `);
  });

  it("shows ggt dev is running with PID when dev lock is held", async () => {
    const { syncJson } = await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
      },
    });

    await acquireDevLock(syncJson.directory);

    await status.run(testCtx, makeArgs(status.args));

    expectStdout().toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.ggt.pub
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/javascript?environment=development
       Docs        https://docs.gadget.dev/api/test

      ggt dev is running (PID ${process.pid}, started 1970-01-01T00:00:00.000Z)

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM
      "
    `);
  });

  it("throws ArgError when positional arguments are provided", async () => {
    const error = await expectError(() => status.run(testCtx, makeArgs(status.args, "status", "extra")));

    expect(error).toBeInstanceOf(ArgError);
  });

  it("throws UnknownDirectoryError when not in a synced directory", async () => {
    mock(SyncJson, "load", () => undefined);

    const error = await expectError(() => status.run(testCtx, makeArgs(status.args)));

    expect(error).toBeInstanceOf(UnknownDirectoryError);
  });

  it("prints conflicts when both sides changed the same file differently", async () => {
    await makeSyncScenario({
      filesVersion1Files: {
        "shared.js": "// original",
      },
      localFiles: {
        "shared.js": "// local version",
      },
      gadgetFiles: {
        "shared.js": "// gadget version",
      },
    });

    await status.run(testCtx, makeArgs(status.args));

    expectStdout().toContain("conflicting changes");
  });
});
