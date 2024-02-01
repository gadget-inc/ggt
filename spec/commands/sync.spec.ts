import fs from "fs-extra";
import ms from "ms";
import notifier from "node-notifier";
import { beforeEach, describe, expect, it, vi } from "vitest";
import which from "which";
import { args, command as sync, type SyncArgs } from "../../src/commands/sync.js";
import { EditError } from "../../src/services/app/edit/error.js";
import { REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION } from "../../src/services/app/edit/operation.js";
import { type Context } from "../../src/services/command/context.js";
import { YarnNotFoundError } from "../../src/services/filesync/error.js";
import { SyncStrategy } from "../../src/services/filesync/filesync.js";
import { select } from "../../src/services/output/prompt.js";
import { assetsPath } from "../../src/services/util/paths.js";
import { nockTestApps, testApp } from "../__support__/app.js";
import { makeContext } from "../__support__/context.js";
import { expectReportErrorAndExit } from "../__support__/error.js";
import { makeFile, makeSyncScenario } from "../__support__/filesync.js";
import { mock, mockOnce } from "../__support__/mock.js";
import { testDirPath } from "../__support__/paths.js";
import { sleep, timeoutMs } from "../__support__/sleep.js";
import { loginTestUser } from "../__support__/user.js";

describe("sync", () => {
  let ctx: Context<SyncArgs>;

  beforeEach(() => {
    loginTestUser();
    nockTestApps();

    ctx = makeContext({
      parse: args,
      argv: [
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
      ].map(String),
    });

    mockOnce(select, () => SyncStrategy.MERGE);
  });

  it("writes changes from gadget to the local filesystem", async () => {
    const { waitUntilLocalFilesVersion, emitGadgetChanges, expectDirs } = await makeSyncScenario();

    await sync(ctx);

    // receive a new file
    await emitGadgetChanges({
      remoteFilesVersion: "2",
      changed: [makeFile({ path: "file.txt", content: "file v2" })],
      deleted: [],
    });

    await waitUntilLocalFilesVersion(2n);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.txt": "file v2",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "file.txt": "file v2",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"2\\"}}}",
          "file.txt": "file v2",
        },
      }
    `);

    // receive an update to a file
    await emitGadgetChanges({
      remoteFilesVersion: "3",
      changed: [makeFile({ path: "file.txt", content: "file v3" })],
      deleted: [],
    });

    await waitUntilLocalFilesVersion(3n);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.txt": "file v2",
          },
          "3": {
            ".gadget/": "",
            "file.txt": "file v3",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "file.txt": "file v3",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}}}",
          "file.txt": "file v3",
        },
      }
    `);

    // receive a delete to a file
    await emitGadgetChanges({
      remoteFilesVersion: "4",
      changed: [],
      deleted: [{ path: "file.txt" }],
    });

    await waitUntilLocalFilesVersion(4n);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.txt": "file v2",
          },
          "3": {
            ".gadget/": "",
            "file.txt": "file v3",
          },
          "4": {
            ".gadget/": "",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/backup/": "",
          ".gadget/backup/file.txt": "file v3",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"4\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"4\\"}}}",
        },
      }
    `);

    // receive a new directory
    await emitGadgetChanges({
      remoteFilesVersion: "5",
      changed: [makeFile({ path: "directory/" })],
      deleted: [],
    });

    await waitUntilLocalFilesVersion(5n);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.txt": "file v2",
          },
          "3": {
            ".gadget/": "",
            "file.txt": "file v3",
          },
          "4": {
            ".gadget/": "",
          },
          "5": {
            ".gadget/": "",
            "directory/": "",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "directory/": "",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/backup/": "",
          ".gadget/backup/file.txt": "file v3",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"5\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"5\\"}}}",
          "directory/": "",
        },
      }
    `);

    // receive a delete to a directory
    await emitGadgetChanges({
      remoteFilesVersion: "6",
      changed: [],
      deleted: [{ path: "directory/" }],
    });

    await waitUntilLocalFilesVersion(6n);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.txt": "file v2",
          },
          "3": {
            ".gadget/": "",
            "file.txt": "file v3",
          },
          "4": {
            ".gadget/": "",
          },
          "5": {
            ".gadget/": "",
            "directory/": "",
          },
          "6": {
            ".gadget/": "",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/backup/": "",
          ".gadget/backup/directory/": "",
          ".gadget/backup/file.txt": "file v3",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"6\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"6\\"}}}",
        },
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

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.txt": "file v2",
          },
          "3": {
            ".gadget/": "",
            "file.txt": "file v3",
          },
          "4": {
            ".gadget/": "",
          },
          "5": {
            ".gadget/": "",
            "directory/": "",
          },
          "6": {
            ".gadget/": "",
          },
          "7": {
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
          },
        },
        "gadgetDir": {
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
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/backup/": "",
          ".gadget/backup/directory/": "",
          ".gadget/backup/file.txt": "file v3",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"7\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"7\\"}}}",
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
        },
      }
    `);
  });

  it("writes changes from gadget in the order they were received", async () => {
    // this test is exactly the same as the previous one, except we just
    // wait for the final filesVersion and expect the same result
    const { waitUntilLocalFilesVersion, emitGadgetChanges, expectDirs } = await makeSyncScenario();

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

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.txt": "file v2",
          },
          "3": {
            ".gadget/": "",
            "file.txt": "file v3",
          },
          "4": {
            ".gadget/": "",
          },
          "5": {
            ".gadget/": "",
            "directory/": "",
          },
          "6": {
            ".gadget/": "",
          },
          "7": {
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
          },
        },
        "gadgetDir": {
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
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/backup/": "",
          ".gadget/backup/directory/": "",
          ".gadget/backup/file.txt": "file v3",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"7\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"7\\"}}}",
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
        },
      }
    `);
  });

  it("writes all received files before stopping", async () => {
    // this test is exactly the same as the previous one, except we just
    // wait for stop() to finish and expect the same result
    const { emitGadgetChanges, expectDirs } = await makeSyncScenario();

    let stop: (() => Promise<void>) | undefined = undefined;
    mock(ctx.signal, "addEventListener", (_, listener) => {
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
      remoteFilesVersion: "7",
      changed: files.map((filename) => makeFile({ path: filename, content: filename })),
      deleted: [],
    });

    ctx.abort();
    await stop!();

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.js": "file v2",
          },
          "3": {
            ".gadget/": "",
            "file.js": "file v2",
            "file.txt": "file v3",
          },
          "4": {
            ".gadget/": "",
            "file.js": "file v2",
          },
          "5": {
            ".gadget/": "",
            "directory/": "",
            "file.js": "file v2",
          },
          "6": {
            ".gadget/": "",
            "file.js": "file v2",
          },
          "7": {
            ".gadget/": "",
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
          },
        },
        "gadgetDir": {
          ".gadget/": "",
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
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/backup/": "",
          ".gadget/backup/directory/": "",
          ".gadget/backup/file.txt": "file v3",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"7\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"7\\"}}}",
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
        },
      }
    `);
  });

  it("doesn't write changes from gadget to the local filesystem if the file is ignored", async () => {
    const { waitUntilLocalFilesVersion, emitGadgetChanges, expectDirs } = await makeSyncScenario({
      filesVersion1Files: {
        ".ignore": "**/tmp",
      },
      gadgetFiles: {
        ".ignore": "**/tmp",
      },
      localFiles: {
        ".ignore": "**/tmp",
      },
    });

    await sync(ctx);

    await emitGadgetChanges({
      remoteFilesVersion: "2",
      changed: [makeFile({ path: "tmp/file.txt", content: "file" })],
      deleted: [],
    });

    // it should still update the filesVersion
    await waitUntilLocalFilesVersion(2n);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            ".ignore": "**/tmp",
          },
          "2": {
            ".gadget/": "",
            ".ignore": "**/tmp",
            "tmp/": "",
            "tmp/file.txt": "file",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          ".ignore": "**/tmp",
          "tmp/": "",
          "tmp/file.txt": "file",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"2\\"}}}",
          ".ignore": "**/tmp",
        },
      }
    `);

    await emitGadgetChanges({
      remoteFilesVersion: "3",
      changed: [],
      deleted: [{ path: "tmp/file.txt" }],
    });

    // it should still update the filesVersion
    await waitUntilLocalFilesVersion(3n);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            ".ignore": "**/tmp",
          },
          "2": {
            ".gadget/": "",
            ".ignore": "**/tmp",
            "tmp/": "",
            "tmp/file.txt": "file",
          },
          "3": {
            ".gadget/": "",
            ".ignore": "**/tmp",
            "tmp/": "",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          ".ignore": "**/tmp",
          "tmp/": "",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}}}",
          ".ignore": "**/tmp",
        },
      }
    `);
  });

  it("sends changes from the local filesystem to gadget", async () => {
    const { localDir, waitUntilGadgetFilesVersion, expectDirs } = await makeSyncScenario();

    await sync(ctx);

    // add a file
    await fs.outputFile(localDir.absolute("file.txt"), "file v2");
    await waitUntilGadgetFilesVersion(2n);
    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.txt": "file v2",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "file.txt": "file v2",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"2\\"}}}",
          "file.txt": "file v2",
        },
      }
    `);

    // update a file
    await fs.outputFile(localDir.absolute("file.txt"), "file v3");
    await waitUntilGadgetFilesVersion(3n);
    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.txt": "file v2",
          },
          "3": {
            ".gadget/": "",
            "file.txt": "file v3",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "file.txt": "file v3",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}}}",
          "file.txt": "file v3",
        },
      }
    `);

    // rename a file
    await fs.rename(localDir.absolute("file.txt"), localDir.absolute("renamed-file.txt"));
    await waitUntilGadgetFilesVersion(4n);
    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.txt": "file v2",
          },
          "3": {
            ".gadget/": "",
            "file.txt": "file v3",
          },
          "4": {
            ".gadget/": "",
            "renamed-file.txt": "file v3",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "renamed-file.txt": "file v3",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"4\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"4\\"}}}",
          "renamed-file.txt": "file v3",
        },
      }
    `);

    // delete a file
    await fs.remove(localDir.absolute("renamed-file.txt"));
    await waitUntilGadgetFilesVersion(5n);
    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.txt": "file v2",
          },
          "3": {
            ".gadget/": "",
            "file.txt": "file v3",
          },
          "4": {
            ".gadget/": "",
            "renamed-file.txt": "file v3",
          },
          "5": {
            ".gadget/": "",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"5\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"5\\"}}}",
        },
      }
    `);

    // add a directory
    await fs.mkdir(localDir.absolute("directory"));
    await waitUntilGadgetFilesVersion(6n);
    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.txt": "file v2",
          },
          "3": {
            ".gadget/": "",
            "file.txt": "file v3",
          },
          "4": {
            ".gadget/": "",
            "renamed-file.txt": "file v3",
          },
          "5": {
            ".gadget/": "",
          },
          "6": {
            ".gadget/": "",
            "directory/": "",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "directory/": "",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"6\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"6\\"}}}",
          "directory/": "",
        },
      }
    `);

    // rename a directory
    await fs.rename(localDir.absolute("directory"), localDir.absolute("renamed-directory"));
    await waitUntilGadgetFilesVersion(7n);
    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.txt": "file v2",
          },
          "3": {
            ".gadget/": "",
            "file.txt": "file v3",
          },
          "4": {
            ".gadget/": "",
            "renamed-file.txt": "file v3",
          },
          "5": {
            ".gadget/": "",
          },
          "6": {
            ".gadget/": "",
            "directory/": "",
          },
          "7": {
            ".gadget/": "",
            "renamed-directory/": "",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "renamed-directory/": "",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"7\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"7\\"}}}",
          "renamed-directory/": "",
        },
      }
    `);

    // delete a directory
    await fs.remove(localDir.absolute("renamed-directory"));
    await waitUntilGadgetFilesVersion(8n);
    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.txt": "file v2",
          },
          "3": {
            ".gadget/": "",
            "file.txt": "file v3",
          },
          "4": {
            ".gadget/": "",
            "renamed-file.txt": "file v3",
          },
          "5": {
            ".gadget/": "",
          },
          "6": {
            ".gadget/": "",
            "directory/": "",
          },
          "7": {
            ".gadget/": "",
            "renamed-directory/": "",
          },
          "8": {
            ".gadget/": "",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"8\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"8\\"}}}",
        },
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
    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.txt": "file v2",
          },
          "3": {
            ".gadget/": "",
            "file.txt": "file v3",
          },
          "4": {
            ".gadget/": "",
            "renamed-file.txt": "file v3",
          },
          "5": {
            ".gadget/": "",
          },
          "6": {
            ".gadget/": "",
            "directory/": "",
          },
          "7": {
            ".gadget/": "",
            "renamed-directory/": "",
          },
          "8": {
            ".gadget/": "",
          },
          "9": {
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
          },
        },
        "gadgetDir": {
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
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"9\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"9\\"}}}",
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
        },
      }
    `);
  });

  it("doesn't send multiple changes to the same file at once", async () => {
    const { localDir, waitUntilGadgetFilesVersion, expectDirs } = await makeSyncScenario();

    await sync(ctx);

    // update a file 10 times
    for (let i = 0; i < 10; i++) {
      await fs.outputFile(localDir.absolute("file.txt"), `v${i + 1}`);
    }

    await waitUntilGadgetFilesVersion(2n);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "file.txt": "v10",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "file.txt": "v10",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"2\\"}}}",
          "file.txt": "v10",
        },
      }
    `);
  });

  it("doesn't send changes from the local filesystem to gadget if the file is ignored", async () => {
    const { localDir, expectDirs } = await makeSyncScenario({
      filesVersion1Files: {
        ".ignore": "**/tmp",
      },
      gadgetFiles: {
        ".ignore": "**/tmp",
      },
      localFiles: {
        ".ignore": "**/tmp",
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

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            ".ignore": "**/tmp",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          ".ignore": "**/tmp",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"1\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"1\\"}}}",
          ".ignore": "**/tmp",
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
        },
      }
    `);
  });

  it("reloads the ignore file when .ignore changes", async () => {
    const { filesync, waitUntilLocalFilesVersion, localDir, waitUntilGadgetFilesVersion, emitGadgetChanges, expectDirs } =
      await makeSyncScenario();

    await sync(ctx);

    vi.spyOn(filesync.directory, "loadIgnoreFile");

    await fs.outputFile(localDir.absolute(".ignore"), "# watch it all");
    await waitUntilGadgetFilesVersion(2n);
    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            ".ignore": "# watch it all",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          ".ignore": "# watch it all",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\",\\"currentEnvironment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"2\\"}}}",
          ".ignore": "# watch it all",
        },
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

    const error = new EditError(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION, "test");

    const gadgetChangesSubscription = expectGadgetChangesSubscription();
    await gadgetChangesSubscription.emitError(error);

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
    // eslint-disable-next-line unicorn/no-null
    mock(which.sync, () => null);
    await expect(sync(ctx)).rejects.toThrow(YarnNotFoundError);
  });

  it("does not throw YarnNotFoundError if yarn is found", async () => {
    await makeSyncScenario();
    mock(which.sync, () => "/path/to/yarn");
    await sync(ctx);
  });

  it("returns after syncing when --once is passed", async () => {
    process.argv.push("--once");
    ctx = makeContext({ parse: args });

    const { filesync } = await makeSyncScenario();
    vi.spyOn(filesync, "subscribeToGadgetChanges");

    await sync(ctx);

    expect(filesync.subscribeToGadgetChanges).not.toHaveBeenCalled();
  });
});
