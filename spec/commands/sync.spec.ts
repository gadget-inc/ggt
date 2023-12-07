import { execa } from "execa";
import fs from "fs-extra";
import ms from "ms";
import nock from "nock";
import notifier from "node-notifier";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import which from "which";
import { command as sync } from "../../src/commands/sync.js";
import { REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION } from "../../src/services/app/edit-graphql.js";
import { Context } from "../../src/services/command/context.js";
import { assetsPath } from "../../src/services/config/paths.js";
import { EditGraphQLError, YarnNotFoundError } from "../../src/services/error/error.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import { nockTestApps, testApp } from "../__support__/app.js";
import { expectReportErrorAndExit } from "../__support__/error.js";
import { makeFile, makeSyncScenario } from "../__support__/filesync.js";
import { testDirPath } from "../__support__/paths.js";
import { sleep } from "../__support__/sleep.js";
import { loginTestUser } from "../__support__/user.js";

describe("sync", () => {
  let ctx: Context;

  beforeEach(() => {
    loginTestUser();
    nockTestApps();

    ctx = new Context({
      _: [
        testDirPath("local"),
        "--app",
        testApp.slug,
        "--file-push-delay",
        ms("10ms" /* default 100ms */),
        "--file-watch-debounce",
        ms("300ms" /* default 300ms */),
        "--file-watch-poll-interval",
        ms("30ms" /* default 3_000ms */),
        "--file-watch-poll-timeout",
        ms("20ms" /* default 20_000ms */),
        "--file-watch-rename-timeout",
        ms("50ms" /* default 1_250ms */),
      ].map(String),
    });
  });

  afterEach(() => {
    ctx.abort();
    expect(nock.pendingMocks()).toEqual([]);
  });

  it("writes changes from gadget to the local filesystem", async () => {
    const { waitUntilLocalFilesVersion, emitGadgetChanges, expectLocalDir } = await makeSyncScenario();

    await sync(ctx);

    // receive a new file
    await emitGadgetChanges({
      remoteFilesVersion: "1",
      changed: [makeFile({ path: "file.js", content: "foo" })],
      deleted: [],
    });

    await waitUntilLocalFilesVersion(1n);

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"1\\"}",
        "file.js": "foo",
      }
    `);

    // receive an update to a file
    await emitGadgetChanges({
      remoteFilesVersion: "2",
      changed: [makeFile({ path: "file.js", content: "foo v2" })],
      deleted: [],
    });

    await waitUntilLocalFilesVersion(2n);

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\"}",
        "file.js": "foo v2",
      }
    `);

    // receive a delete to a file
    await emitGadgetChanges({
      remoteFilesVersion: "3",
      changed: [],
      deleted: [{ path: "file.js" }],
    });

    await waitUntilLocalFilesVersion(3n);

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/backup/": "",
        ".gadget/backup/file.js": "foo v2",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
      }
    `);

    // receive a new directory
    await emitGadgetChanges({
      remoteFilesVersion: "4",
      changed: [makeFile({ path: "directory/" })],
      deleted: [],
    });

    await waitUntilLocalFilesVersion(4n);

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/backup/": "",
        ".gadget/backup/file.js": "foo v2",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"4\\"}",
        "directory/": "",
      }
    `);

    // receive a delete to a directory
    await emitGadgetChanges({
      remoteFilesVersion: "5",
      changed: [],
      deleted: [{ path: "directory/" }],
    });

    await waitUntilLocalFilesVersion(5n);

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/backup/": "",
        ".gadget/backup/directory/": "",
        ".gadget/backup/file.js": "foo v2",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"5\\"}",
      }
    `);

    // receive a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.js`);
    await emitGadgetChanges({
      remoteFilesVersion: "6",
      changed: files.map((filename) => makeFile({ path: filename, content: filename })),
      deleted: [],
    });

    await waitUntilLocalFilesVersion(6n);

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/backup/": "",
        ".gadget/backup/directory/": "",
        ".gadget/backup/file.js": "foo v2",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"6\\"}",
        "file1.js": "file1.js",
        "file10.js": "file10.js",
        "file2.js": "file2.js",
        "file3.js": "file3.js",
        "file4.js": "file4.js",
        "file5.js": "file5.js",
        "file6.js": "file6.js",
        "file7.js": "file7.js",
        "file8.js": "file8.js",
        "file9.js": "file9.js",
      }
    `);
  });

  it("writes changes from gadget in the order they were received", async () => {
    // this test is exactly the same as the previous one, except we just
    // wait for the final filesVersion and expect the same result
    const { waitUntilLocalFilesVersion, emitGadgetChanges, expectLocalDir } = await makeSyncScenario();

    await sync(ctx);

    // receive a new file
    await emitGadgetChanges({
      remoteFilesVersion: "1",
      changed: [makeFile({ path: "file.js", content: "foo" })],
      deleted: [],
    });

    // receive an update to a file
    await emitGadgetChanges({
      remoteFilesVersion: "2",
      changed: [makeFile({ path: "file.js", content: "foo v2" })],
      deleted: [],
    });

    // receive a delete to a file
    await emitGadgetChanges({
      remoteFilesVersion: "3",
      changed: [],
      deleted: [{ path: "file.js" }],
    });

    // receive a new directory
    await emitGadgetChanges({
      remoteFilesVersion: "4",
      changed: [makeFile({ path: "directory/" })],
      deleted: [],
    });

    // receive a delete to a directory
    await emitGadgetChanges({
      remoteFilesVersion: "5",
      changed: [],
      deleted: [{ path: "directory/" }],
    });

    // receive a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.js`);
    await emitGadgetChanges({
      remoteFilesVersion: "6",
      changed: files.map((filename) => makeFile({ path: filename, content: filename })),
      deleted: [],
    });

    await waitUntilLocalFilesVersion(6n);

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/backup/": "",
        ".gadget/backup/directory/": "",
        ".gadget/backup/file.js": "foo v2",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"6\\"}",
        "file1.js": "file1.js",
        "file10.js": "file10.js",
        "file2.js": "file2.js",
        "file3.js": "file3.js",
        "file4.js": "file4.js",
        "file5.js": "file5.js",
        "file6.js": "file6.js",
        "file7.js": "file7.js",
        "file8.js": "file8.js",
        "file9.js": "file9.js",
      }
    `);
  });

  it("writes all received files before stopping", async () => {
    // this test is exactly the same as the previous one, except we just
    // wait for stop() to finish and expect the same result
    const { emitGadgetChanges, expectLocalDir } = await makeSyncScenario();

    let stop: (() => Promise<void>) | undefined = undefined;
    vi.spyOn(ctx.signal, "addEventListener").mockImplementationOnce((_, listener) => {
      stop = listener as () => Promise<void>;
    });

    await sync(ctx);

    // receive a new file
    await emitGadgetChanges({
      remoteFilesVersion: "1",
      changed: [makeFile({ path: "file.js", content: "foo" })],
      deleted: [],
    });

    // receive an update to a file
    await emitGadgetChanges({
      remoteFilesVersion: "2",
      changed: [makeFile({ path: "file.js", content: "foo v2" })],
      deleted: [],
    });

    // receive a delete to a file
    await emitGadgetChanges({
      remoteFilesVersion: "3",
      changed: [],
      deleted: [{ path: "file.js" }],
    });

    // receive a new directory
    await emitGadgetChanges({
      remoteFilesVersion: "4",
      changed: [makeFile({ path: "directory/" })],
      deleted: [],
    });

    // receive a delete to a directory
    await emitGadgetChanges({
      remoteFilesVersion: "5",
      changed: [],
      deleted: [{ path: "directory/" }],
    });

    // receive a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.js`);
    await emitGadgetChanges({
      remoteFilesVersion: "6",
      changed: files.map((filename) => makeFile({ path: filename, content: filename })),
      deleted: [],
    });

    ctx.abort();
    await stop!();

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/backup/": "",
        ".gadget/backup/directory/": "",
        ".gadget/backup/file.js": "foo v2",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"6\\"}",
        "file1.js": "file1.js",
        "file10.js": "file10.js",
        "file2.js": "file2.js",
        "file3.js": "file3.js",
        "file4.js": "file4.js",
        "file5.js": "file5.js",
        "file6.js": "file6.js",
        "file7.js": "file7.js",
        "file8.js": "file8.js",
        "file9.js": "file9.js",
      }
    `);
  });

  it("doesn't write changes from gadget to the local filesystem if the file is ignored", async () => {
    const { waitUntilLocalFilesVersion, emitGadgetChanges, expectLocalDir } = await makeSyncScenario({
      localFiles: {
        ".ignore": "tmp",
        "tmp/file.js": "foo",
        "tmp/file2.js": "bar",
      },
      gadgetFiles: {
        ".ignore": "tmp",
        "tmp/file.js": "foo",
        "tmp/file2.js": "bar",
      },
    });

    await sync(ctx);

    await emitGadgetChanges({
      remoteFilesVersion: "2",
      changed: [makeFile({ path: "tmp/file.js", content: "foo changed" })],
      deleted: [{ path: "tmp/file2.js" }],
    });

    // it should still update the filesVersion
    await waitUntilLocalFilesVersion(2n);

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\"}",
        ".ignore": "tmp",
        "tmp/": "",
        "tmp/file.js": "foo",
        "tmp/file2.js": "bar",
      }
    `);
  });

  it("sends changes from the local filesystem to gadget", async () => {
    const { localDir, waitUntilGadgetFilesVersion, expectGadgetDir } = await makeSyncScenario();

    await sync(ctx);

    // add a file
    await fs.outputFile(localDir.absolute("file.js"), "foo");
    await waitUntilGadgetFilesVersion(2n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "file.js": "foo",
      }
    `);

    // update a file
    await fs.outputFile(localDir.absolute("file.js"), "foo v2");
    await waitUntilGadgetFilesVersion(3n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "file.js": "foo v2",
      }
    `);

    // move a file
    await fs.move(localDir.absolute("file.js"), localDir.absolute("renamed-file.js"));
    await waitUntilGadgetFilesVersion(4n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "file.js": "foo v2",
        "renamed-file.js": "foo v2",
      }
    `);

    // delete a file
    await fs.remove(localDir.absolute("renamed-file.js"));
    await waitUntilGadgetFilesVersion(5n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "file.js": "foo v2",
      }
    `);

    // add a directory
    await fs.mkdir(localDir.absolute("directory"));
    await waitUntilGadgetFilesVersion(6n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "directory/": "",
        "file.js": "foo v2",
      }
    `);

    // rename a directory
    await fs.move(localDir.absolute("directory"), localDir.absolute("renamed-directory"));
    await waitUntilGadgetFilesVersion(7n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "directory/": "",
        "file.js": "foo v2",
        "renamed-directory/": "",
      }
    `);

    // delete a directory
    await fs.remove(localDir.absolute("renamed-directory"));
    await waitUntilGadgetFilesVersion(8n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "directory/": "",
        "file.js": "foo v2",
      }
    `);

    // add a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.js`);

    // sleep a bit between each one to simulate a slow filesystem
    for (const filename of files) {
      await fs.outputFile(localDir.absolute(filename), filename);
      await sleep("5ms");
    }

    await waitUntilGadgetFilesVersion(9n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "directory/": "",
        "file.js": "foo v2",
        "file1.js": "file1.js",
        "file10.js": "file10.js",
        "file2.js": "file2.js",
        "file3.js": "file3.js",
        "file4.js": "file4.js",
        "file5.js": "file5.js",
        "file6.js": "file6.js",
        "file7.js": "file7.js",
        "file8.js": "file8.js",
        "file9.js": "file9.js",
      }
    `);
  });

  it("doesn't send multiple changes to the same file at once", async () => {
    const { localDir, waitUntilGadgetFilesVersion, expectGadgetDir } = await makeSyncScenario();

    await sync(ctx);

    // update a file 10 times
    for (let i = 0; i < 10; i++) {
      await fs.outputFile(localDir.absolute("file.js"), `v${i + 1}`);
    }

    await waitUntilGadgetFilesVersion(2n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "file.js": "v10",
      }
    `);
  });

  it("doesn't send changes from the local filesystem to gadget if the file is ignored", async () => {
    const { localDir, expectGadgetDir } = await makeSyncScenario({
      localFiles: {
        ".ignore": "tmp",
      },
    });

    await sync(ctx);

    // add a file
    await fs.outputFile(localDir.absolute("tmp/file.js"), "foo");

    // update a file
    await fs.outputFile(localDir.absolute("tmp/file.js"), "foo v2");

    // move a file
    await fs.move(localDir.absolute("tmp/file.js"), localDir.absolute("tmp/renamed-file.js"));

    // delete a file
    await fs.remove(localDir.absolute("tmp/renamed-file.js"));

    // add a directory
    await fs.mkdir(localDir.absolute("tmp/directory"));

    // rename a directory
    await fs.move(localDir.absolute("tmp/directory"), localDir.absolute("tmp/renamed-directory"));

    // delete a directory
    await fs.remove(localDir.absolute("tmp/renamed-directory"));

    // add a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.js`);
    for (const filename of files) {
      await fs.outputFile(localDir.absolute(`tmp/${filename}`), filename);
    }

    await sleep("2s");

    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
      }
    `);
  });

  it("runs `yarn install --check-files` when yarn.lock changes", async () => {
    const { filesync, localDir, emitGadgetChanges } = await makeSyncScenario();

    const execaCalled = new PromiseSignal();
    execa.mockImplementationOnce(() => {
      execaCalled.resolve();
      return Promise.resolve({});
    });

    await sync(ctx);

    await emitGadgetChanges({
      remoteFilesVersion: "1",
      changed: [makeFile({ path: "yarn.lock", content: "# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY." })],
      deleted: [],
    });

    await execaCalled;

    expect(filesync.filesVersion).toBe(1n);
    expect(execa.mock.lastCall).toEqual(["yarn", ["install", "--check-files"], { cwd: localDir.path }]);
  });

  it("reloads the ignore file when .ignore changes", async () => {
    const { filesync, waitUntilLocalFilesVersion, localDir, expectGadgetDir, waitUntilGadgetFilesVersion, emitGadgetChanges } =
      await makeSyncScenario();

    await sync(ctx);

    vi.spyOn(filesync.directory, "loadIgnoreFile");

    await fs.outputFile(localDir.absolute(".ignore"), "# watch it all");
    await waitUntilGadgetFilesVersion(2n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".ignore": "# watch it all",
      }
    `);

    expect(filesync.directory.loadIgnoreFile).toHaveBeenCalledTimes(1);

    await emitGadgetChanges({
      remoteFilesVersion: "3",
      changed: [makeFile({ path: ".ignore", content: "tmp" })],
      deleted: [],
    });

    await waitUntilLocalFilesVersion(3n);

    expect(filesync.directory.loadIgnoreFile).toHaveBeenCalledTimes(2);
  });

  it("notifies the user when an error occurs", async () => {
    const { expectGadgetChangesSubscription } = await makeSyncScenario();

    await sync(ctx);

    const error = new EditGraphQLError(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION, "test");

    const gadgetChangesSubscription = expectGadgetChangesSubscription();
    gadgetChangesSubscription.emitError(error);

    await expectReportErrorAndExit(error);

    expect(notifier.notify).toHaveBeenCalledWith(
      {
        title: "Gadget",
        subtitle: "Uh oh!",
        message: "An error occurred while syncing files",
        sound: true,
        timeout: false,
        icon: assetsPath("favicon-128@4x.png"),
        contentImage: assetsPath("favicon-128@4x.png"),
      },
      expect.any(Function),
    );
  });

  it("throws YarnNotFoundError if yarn is not found", async () => {
    await makeSyncScenario();
    which.sync.mockReturnValue(undefined);
    await expect(sync(ctx)).rejects.toThrow(YarnNotFoundError);
  });

  it("does not throw YarnNotFoundError if yarn is found", async () => {
    await makeSyncScenario();
    which.sync.mockReturnValue("/path/to/yarn");
    await sync(ctx);
  });
});
