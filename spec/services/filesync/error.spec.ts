import fs from "fs-extra";
import { beforeEach, describe, expect, it } from "vitest";
import { Directory } from "../../../src/services/filesync/directory.js";
import { TooManySyncAttemptsError, UnknownDirectoryError, YarnNotFoundError } from "../../../src/services/filesync/error.js";
import { SyncJson, SyncJsonArgs } from "../../../src/services/filesync/sync-json.js";
import { noop } from "../../../src/services/util/function.js";
import { nockTestApps, testApp } from "../../__support__/app.js";
import { makeContext } from "../../__support__/context.js";
import { mockOnce } from "../../__support__/mock.js";
import { loginTestUser } from "../../__support__/user.js";

describe(YarnNotFoundError.name, () => {
  it("renders correctly", () => {
    const error = new YarnNotFoundError();
    expect(error.toString()).toMatchInlineSnapshot(`
      "Yarn must be installed to sync your application. You can install it by running:

        $ npm install --global yarn

      For more information, see: https://classic.yarnpkg.com/en/docs/install"
    `);
  });
});

describe(UnknownDirectoryError.name, () => {
  let syncJson: SyncJson;

  beforeEach(async () => {
    loginTestUser();
    nockTestApps();

    const ctx = makeContext({ parse: SyncJsonArgs, argv: ["sync", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`] });
    const directory = await Directory.init("/Users/jane/doe/");

    // mock fs.ensureDir so we don't actually create the /Users/jane/doe/ directory
    mockOnce(fs, "ensureDir", noop);
    syncJson = await SyncJson.loadOrInit(ctx, { directory });
    expect(fs.ensureDir).toHaveBeenCalledOnce();
  });

  it("renders correctly", () => {
    const error = new UnknownDirectoryError(syncJson.ctx, { directory: syncJson.directory });

    expect(error.toString()).toMatchInlineSnapshot(`
      "We failed to find a \\".gadget/sync.json\\" file in this directory:

        /Users/jane/doe/

      If you're running \\"ggt sync\\" for the first time, we recommend
      using a gadget specific directory like this:

        ggt sync ~/gadget/test --app=test

      If you're certain you want to sync the contents of that directory
      to Gadget, run \\"ggt sync\\" again with the --allow-unknown-directory flag:

        ggt sync /Users/jane/doe/ --app=test --allow-unknown-directory"
    `);
  });
});

describe(TooManySyncAttemptsError.name, () => {
  it("renders correctly", () => {
    const error = new TooManySyncAttemptsError(10);
    expect(error.toString()).toMatchInlineSnapshot(`
      "We synced your local files with Gadget 10 times, but
      your local filesystem is still out of sync.

      Make sure no one else is editing files in the Gadget editor
      and try again.

      If you think this is a bug, please submit an issue using the link below.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000"
    `);
  });
});
