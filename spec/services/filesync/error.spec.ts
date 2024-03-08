import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { AvailableCommand } from "../../../src/services/command/command.js";
import { Directory } from "../../../src/services/filesync/directory.js";
import { TooManySyncAttemptsError, UnknownDirectoryError, YarnNotFoundError } from "../../../src/services/filesync/error.js";
import { SyncJson, SyncJsonArgs } from "../../../src/services/filesync/sync-json.js";
import { nockTestApps, testApp } from "../../__support__/app.js";
import { makeContext } from "../../__support__/context.js";
import { mockOnce } from "../../__support__/mock.js";
import { loginTestUser } from "../../__support__/user.js";

describe(YarnNotFoundError.name, () => {
  it("renders correctly", () => {
    const error = new YarnNotFoundError();
    expect(error.sprint()).toMatchInlineSnapshot(`
      "Yarn must be installed to sync your application. You can install it by running:

        $ npm install --global yarn

      For more information, see: https://classic.yarnpkg.com/en/docs/install"
    `);
  });
});

// these tests are skipped on Windows because the snapshot contains a
// Unix path that keeps failing in CI
describe.skipIf(os.platform() === "win32")(UnknownDirectoryError.name, () => {
  const makeSyncJson = async (command: AvailableCommand): Promise<SyncJson> => {
    const application = testApp.slug;
    const environment = testApp.environments[0]!.name;

    const ctx = makeContext({ parse: SyncJsonArgs, argv: [command, `--app=${application}`, `--env=${environment}`] });
    ctx.app = testApp;
    ctx.env = testApp.environments[0]!;

    const directory = await Directory.init(path.resolve("/Users/jane/doe/"));

    // @ts-expect-error - SyncJson's constructor is private
    const syncJson: SyncJson = new SyncJson(ctx, directory, undefined, {
      application,
      environment,
      environments: {
        [environment]: { filesVersion: "0" },
      },
    });

    return syncJson;
  };

  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  it.each(["dev", "deploy", "push", "pull", "status"] as const)("renders correctly when %s is passed", async (command) => {
    const syncJson = await makeSyncJson(command);
    const error = new UnknownDirectoryError(syncJson.ctx, { directory: syncJson.directory });
    expect(error.sprint()).toMatchSnapshot();
  });

  it("renders correctly when the file exists but is invalid", async () => {
    mockOnce(fs, "existsSync", () => true);
    const syncJson = await makeSyncJson("dev");
    const error = new UnknownDirectoryError(syncJson.ctx, { directory: syncJson.directory });
    expect(error.sprint()).toMatchSnapshot();
  });
});

describe(TooManySyncAttemptsError.name, () => {
  it("renders correctly", () => {
    const error = new TooManySyncAttemptsError(10);
    expect(error.sprint()).toMatchInlineSnapshot(`
      "We synced your local files with Gadget 10 times, but
      your local filesystem is still out of sync.

      Make sure no one else is editing files in the Gadget editor
      and try again.

      If you think this is a bug, use the link below to create an issue on GitHub.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000
      "
    `);
  });
});
