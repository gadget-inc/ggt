import { execa } from "execa";
import fs from "fs-extra";
import ms from "ms";
import nock from "nock";
import notifier from "node-notifier";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import which from "which";
import { args, command as sync } from "../../src/commands/sync.js";
import { EditGraphQLError, REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION } from "../../src/services/app/edit-graphql.js";
import { type Context } from "../../src/services/command/context.js";
import { YarnNotFoundError } from "../../src/services/filesync/error.js";
import { assetsPath } from "../../src/services/util/paths.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import { nockTestApps, testApp } from "../__support__/app.js";
import { makeContext } from "../__support__/context.js";
import { expectReportErrorAndExit } from "../__support__/error.js";
import { makeFile, makeSyncScenario } from "../__support__/filesync.js";
import { testDirPath } from "../__support__/paths.js";
import { sleep, timeoutMs } from "../__support__/sleep.js";
import { loginTestUser } from "../__support__/user.js";

describe("sync", () => {
  let ctx: Context<typeof args>;

  beforeEach(() => {
    loginTestUser();
    nockTestApps();

    process.argv = [
      "node",
      "ggt",
      "sync",
      testDirPath("local"),
      "--app",
      testApp.slug,
      "--file-push-delay",
      ms("10ms" /* default 100ms */),
      "--file-watch-debounce",
      ms("300ms" /* default 300ms */),
      "--file-watch-poll-interval",
      ms("30ms" /* default 3s */),
      "--file-watch-poll-timeout",
      ms("20ms" /* default 20s */),
      "--file-watch-rename-timeout",
      ms("50ms" /* default 1.25s */),
    ].map(String);

    ctx = makeContext(args);
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
      remoteFilesVersion: "2",
      changed: [makeFile({ path: "file.txt", content: "file v2" })],
      deleted: [],
    });

    await waitUntilLocalFilesVersion(2n);

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\"}",
        "file.txt": "file v2",
      }
    `);

    // receive an update to a file
    await emitGadgetChanges({
      remoteFilesVersion: "3",
      changed: [makeFile({ path: "file.txt", content: "file v3" })],
      deleted: [],
    });

    await waitUntilLocalFilesVersion(3n);

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
        "file.txt": "file v3",
      }
    `);

    // receive a delete to a file
    await emitGadgetChanges({
      remoteFilesVersion: "4",
      changed: [],
      deleted: [{ path: "file.txt" }],
    });

    await waitUntilLocalFilesVersion(4n);

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/backup/": "",
        ".gadget/backup/file.txt": "file v3",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"4\\"}",
      }
    `);

    // receive a new directory
    await emitGadgetChanges({
      remoteFilesVersion: "5",
      changed: [makeFile({ path: "directory/" })],
      deleted: [],
    });

    await waitUntilLocalFilesVersion(5n);

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/backup/": "",
        ".gadget/backup/file.txt": "file v3",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"5\\"}",
        "directory/": "",
      }
    `);

    // receive a delete to a directory
    await emitGadgetChanges({
      remoteFilesVersion: "6",
      changed: [],
      deleted: [{ path: "directory/" }],
    });

    await waitUntilLocalFilesVersion(6n);

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/backup/": "",
        ".gadget/backup/directory/": "",
        ".gadget/backup/file.txt": "file v3",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"6\\"}",
      }
    `);

    // receive a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.txt`);
    await emitGadgetChanges({
      remoteFilesVersion: "7",
      changed: files.map((filename) => makeFile({ path: filename, content: filename })),
      deleted: [],
    });

    await waitUntilLocalFilesVersion(7n);

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/backup/": "",
        ".gadget/backup/directory/": "",
        ".gadget/backup/file.txt": "file v3",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"7\\"}",
        "file1.txt": "file1.txt",
        "file10.txt": "file10.txt",
        "file2.txt": "file2.txt",
        "file3.txt": "file3.txt",
        "file4.txt": "file4.txt",
        "file5.txt": "file5.txt",
        "file6.txt": "file6.txt",
        "file7.txt": "file7.txt",
        "file8.txt": "file8.txt",
        "file9.txt": "file9.txt",
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
      remoteFilesVersion: "2",
      changed: [makeFile({ path: "file.txt", content: "file v2" })],
      deleted: [],
    });

    // receive an update to a file
    await emitGadgetChanges({
      remoteFilesVersion: "3",
      changed: [makeFile({ path: "file.txt", content: "file v3" })],
      deleted: [],
    });

    // receive a delete to a file
    await emitGadgetChanges({
      remoteFilesVersion: "4",
      changed: [],
      deleted: [{ path: "file.txt" }],
    });

    // receive a new directory
    await emitGadgetChanges({
      remoteFilesVersion: "5",
      changed: [makeFile({ path: "directory/" })],
      deleted: [],
    });

    // receive a delete to a directory
    await emitGadgetChanges({
      remoteFilesVersion: "6",
      changed: [],
      deleted: [{ path: "directory/" }],
    });

    // receive a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.txt`);
    await emitGadgetChanges({
      remoteFilesVersion: "7",
      changed: files.map((filename) => makeFile({ path: filename, content: filename })),
      deleted: [],
    });

    await waitUntilLocalFilesVersion(7n);

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/backup/": "",
        ".gadget/backup/directory/": "",
        ".gadget/backup/file.txt": "file v3",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"7\\"}",
        "file1.txt": "file1.txt",
        "file10.txt": "file10.txt",
        "file2.txt": "file2.txt",
        "file3.txt": "file3.txt",
        "file4.txt": "file4.txt",
        "file5.txt": "file5.txt",
        "file6.txt": "file6.txt",
        "file7.txt": "file7.txt",
        "file8.txt": "file8.txt",
        "file9.txt": "file9.txt",
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
      remoteFilesVersion: "2",
      changed: [makeFile({ path: "file.js", content: "file v2" })],
      deleted: [],
    });

    // receive an update to a file
    await emitGadgetChanges({
      remoteFilesVersion: "3",
      changed: [makeFile({ path: "file.txt", content: "file v3" })],
      deleted: [],
    });

    // receive a delete to a file
    await emitGadgetChanges({
      remoteFilesVersion: "4",
      changed: [],
      deleted: [{ path: "file.txt" }],
    });

    // receive a new directory
    await emitGadgetChanges({
      remoteFilesVersion: "5",
      changed: [makeFile({ path: "directory/" })],
      deleted: [],
    });

    // receive a delete to a directory
    await emitGadgetChanges({
      remoteFilesVersion: "6",
      changed: [],
      deleted: [{ path: "directory/" }],
    });

    // receive a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.txt`);
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
        ".gadget/backup/file.txt": "file v3",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"6\\"}",
        "file.js": "file v2",
        "file1.txt": "file1.txt",
        "file10.txt": "file10.txt",
        "file2.txt": "file2.txt",
        "file3.txt": "file3.txt",
        "file4.txt": "file4.txt",
        "file5.txt": "file5.txt",
        "file6.txt": "file6.txt",
        "file7.txt": "file7.txt",
        "file8.txt": "file8.txt",
        "file9.txt": "file9.txt",
      }
    `);
  });

  it("doesn't write changes from gadget to the local filesystem if the file is ignored", async () => {
    const { waitUntilLocalFilesVersion, emitGadgetChanges, expectLocalDir } = await makeSyncScenario({
      localFiles: {
        ".ignore": "tmp",
        "tmp/file1.txt": "file1 v1",
        "tmp/file2.txt": "file2 v1",
      },
      gadgetFiles: {
        ".ignore": "tmp",
        "tmp/file1.txt": "file1 v1",
        "tmp/file2.txt": "file2 v1",
      },
    });

    await sync(ctx);

    await emitGadgetChanges({
      remoteFilesVersion: "2",
      changed: [makeFile({ path: "tmp/file1.txt", content: "file1 v2" })],
      deleted: [{ path: "tmp/file2.txt" }],
    });

    // it should still update the filesVersion
    await waitUntilLocalFilesVersion(2n);

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\"}",
        ".ignore": "tmp",
        "tmp/": "",
        "tmp/file1.txt": "file1 v1",
        "tmp/file2.txt": "file2 v1",
      }
    `);
  });

  it("sends changes from the local filesystem to gadget", async () => {
    const { localDir, waitUntilGadgetFilesVersion, expectGadgetDir } = await makeSyncScenario();

    await sync(ctx);

    // add a file
    await fs.outputFile(localDir.absolute("file.txt"), "file v2");
    await waitUntilGadgetFilesVersion(2n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "file.txt": "file v2",
      }
    `);

    // update a file
    await fs.outputFile(localDir.absolute("file.txt"), "file v3");
    await waitUntilGadgetFilesVersion(3n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "file.txt": "file v3",
      }
    `);

    // rename a file
    await fs.rename(localDir.absolute("file.txt"), localDir.absolute("renamed-file.txt"));
    await waitUntilGadgetFilesVersion(4n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "renamed-file.txt": "file v3",
      }
    `);

    // delete a file
    await fs.remove(localDir.absolute("renamed-file.txt"));
    await waitUntilGadgetFilesVersion(5n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
      }
    `);

    // add a directory
    await fs.mkdir(localDir.absolute("directory"));
    await waitUntilGadgetFilesVersion(6n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "directory/": "",
      }
    `);

    // rename a directory
    await fs.rename(localDir.absolute("directory"), localDir.absolute("renamed-directory"));
    await waitUntilGadgetFilesVersion(7n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "renamed-directory/": "",
      }
    `);

    // delete a directory
    await fs.remove(localDir.absolute("renamed-directory"));
    await waitUntilGadgetFilesVersion(8n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
      }
    `);

    // add a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.txt`);

    // sleep a bit between each one to simulate a slow filesystem
    for (const filename of files) {
      await fs.outputFile(localDir.absolute(filename), filename);
      await sleep("5ms");
    }

    await waitUntilGadgetFilesVersion(9n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "file1.txt": "file1.txt",
        "file10.txt": "file10.txt",
        "file2.txt": "file2.txt",
        "file3.txt": "file3.txt",
        "file4.txt": "file4.txt",
        "file5.txt": "file5.txt",
        "file6.txt": "file6.txt",
        "file7.txt": "file7.txt",
        "file8.txt": "file8.txt",
        "file9.txt": "file9.txt",
      }
    `);
  });

  it("doesn't send multiple changes to the same file at once", async () => {
    const { localDir, waitUntilGadgetFilesVersion, expectGadgetDir } = await makeSyncScenario();

    await sync(ctx);

    // update a file 10 times
    for (let i = 0; i < 10; i++) {
      await fs.outputFile(localDir.absolute("file.txt"), `v${i + 1}`);
    }

    await waitUntilGadgetFilesVersion(2n);
    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "file.txt": "v10",
      }
    `);
  });

  it("doesn't send changes from the local filesystem to gadget if the file is ignored", async () => {
    const { localDir, expectGadgetDir, expectLocalDir } = await makeSyncScenario({
      filesVersion1Files: {
        ".ignore": "tmp",
      },
      gadgetFiles: {
        ".ignore": "tmp",
      },
    });

    await sync(ctx);

    // add a file
    await fs.outputFile(localDir.absolute("tmp/file.js"), "foo");

    // update a file
    await fs.outputFile(localDir.absolute("tmp/file.js"), "foo v2");

    // rename a file
    await fs.rename(localDir.absolute("tmp/file.js"), localDir.absolute("tmp/renamed-file.js"));

    // delete a file
    await fs.remove(localDir.absolute("tmp/renamed-file.js"));

    // add a directory
    await fs.mkdir(localDir.absolute("tmp/directory"));

    // rename a directory
    await fs.rename(localDir.absolute("tmp/directory"), localDir.absolute("tmp/renamed-directory"));

    // delete a directory
    await fs.remove(localDir.absolute("tmp/renamed-directory"));

    // add a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.txt`);
    for (const filename of files) {
      await fs.outputFile(localDir.absolute(`tmp/${filename}`), filename);
    }

    // give the watcher a chance to see the changes
    await sleep(timeoutMs("2.5s"));

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"1\\"}",
        ".ignore": "tmp",
        "tmp/": "",
        "tmp/file1.txt": "file1.txt",
        "tmp/file10.txt": "file10.txt",
        "tmp/file2.txt": "file2.txt",
        "tmp/file3.txt": "file3.txt",
        "tmp/file4.txt": "file4.txt",
        "tmp/file5.txt": "file5.txt",
        "tmp/file6.txt": "file6.txt",
        "tmp/file7.txt": "file7.txt",
        "tmp/file8.txt": "file8.txt",
        "tmp/file9.txt": "file9.txt",
      }
    `);

    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".ignore": "tmp",
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
      remoteFilesVersion: "2",
      changed: [makeFile({ path: "yarn.lock", content: "# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY." })],
      deleted: [],
    });

    await execaCalled;

    expect(filesync.filesVersion).toBe(2n);
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
