import fs from "fs-extra";
import ms from "ms";
import notifier from "node-notifier";
import pMap from "p-map";
import { beforeEach, describe, expect, it, vi } from "vitest";
import which from "which";

import * as dev from "../../src/commands/dev.js";
import { REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION } from "../../src/services/app/edit/operation.js";
import { ClientError } from "../../src/services/app/error.js";
import { YarnNotFoundError } from "../../src/services/filesync/error.js";
import { FileSyncStrategy } from "../../src/services/filesync/strategy.js";
import { assetsPath } from "../../src/services/util/paths.js";
import { nockTestApps, testApp } from "../__support__/app.js";
import { makeArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { waitForReportErrorAndExit } from "../__support__/error.js";
import { makeFile, makeSyncScenario } from "../__support__/filesync.js";
import { mock, mockSelectOnce } from "../__support__/mock.js";
import { testDirPath } from "../__support__/paths.js";
import { sleep, timeoutMs } from "../__support__/sleep.js";
import { loginTestUser } from "../__support__/user.js";

describe("dev", () => {
  let args: dev.DevArgsResult;

  beforeEach(() => {
    loginTestUser();
    nockTestApps();

    args = makeArgs(
      dev.args,
      "dev",
      testDirPath("local"),
      "--app",
      testApp.slug,
      "--file-push-delay",
      String(ms("10ms" /* default 100ms */)),
      "--file-watch-debounce",
      String(ms("300ms" /* default 300ms */)),
      "--file-watch-poll-interval",
      String(ms("30ms" /* default 3s */)),
      "--file-watch-poll-timeout",
      String(ms("20ms" /* default 20s */)),
      "--file-watch-rename-timeout",
      String(ms("50ms" /* default 1.25s */)),
    );

    mockSelectOnce(FileSyncStrategy.MERGE);
  });

  it("writes changes from gadget to the local filesystem", async () => {
    const { waitUntilLocalFilesVersion, emitGadgetChanges, expectDirs } = await makeSyncScenario();

    await dev.run(testCtx, args);

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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"4"}}}",
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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"5"}}}",
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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"6"}}}",
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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"7"}}}",
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

    await dev.run(testCtx, args);

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"7"}}}",
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

    await dev.run(testCtx, args);

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

    testCtx.abort();
    await testCtx.done;

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"7"}}}",
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

    await dev.run(testCtx, args);

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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
            ".ignore": "**/tmp",
          },
        }
      `);
  });

  it("sends changes from the local filesystem to gadget", { retry: 3 }, async () => {
    const { localDir, waitUntilGadgetFilesVersion, expectDirs } = await makeSyncScenario();

    await dev.run(testCtx, args);

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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"4"}}}",
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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"5"}}}",
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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"6"}}}",
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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"7"}}}",
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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"8"}}}",
          },
        }
      `);

    // add a bunch of files
    await pMap(
      Array.from({ length: 10 }, (_, i) => {
        if (i < 9) {
          return `file-0${i + 1}.txt`;
        }
        return `file-${i + 1}.txt`;
      }),
      async (filename) => fs.outputFile(localDir.absolute(filename), filename),
    );

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
              "file-01.txt": "file-01.txt",
              "file-02.txt": "file-02.txt",
              "file-03.txt": "file-03.txt",
              "file-04.txt": "file-04.txt",
              "file-05.txt": "file-05.txt",
              "file-06.txt": "file-06.txt",
              "file-07.txt": "file-07.txt",
              "file-08.txt": "file-08.txt",
              "file-09.txt": "file-09.txt",
              "file-10.txt": "file-10.txt",
            },
          },
          "gadgetDir": {
            ".gadget/": "",
            "file-01.txt": "file-01.txt",
            "file-02.txt": "file-02.txt",
            "file-03.txt": "file-03.txt",
            "file-04.txt": "file-04.txt",
            "file-05.txt": "file-05.txt",
            "file-06.txt": "file-06.txt",
            "file-07.txt": "file-07.txt",
            "file-08.txt": "file-08.txt",
            "file-09.txt": "file-09.txt",
            "file-10.txt": "file-10.txt",
          },
          "localDir": {
            ".gadget/": "",
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"9"}}}",
            "file-01.txt": "file-01.txt",
            "file-02.txt": "file-02.txt",
            "file-03.txt": "file-03.txt",
            "file-04.txt": "file-04.txt",
            "file-05.txt": "file-05.txt",
            "file-06.txt": "file-06.txt",
            "file-07.txt": "file-07.txt",
            "file-08.txt": "file-08.txt",
            "file-09.txt": "file-09.txt",
            "file-10.txt": "file-10.txt",
          },
        }
      `);
  });

  it("doesn't send multiple changes to the same file at once", { retry: 3 }, async () => {
    const { localDir, waitUntilGadgetFilesVersion, expectDirs } = await makeSyncScenario();

    await dev.run(testCtx, args);

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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
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

    await dev.run(testCtx, args);

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
    await pMap(
      Array.from({ length: 10 }, (_, i) => {
        if (i < 9) {
          return `file-0${i + 1}.txt`;
        }
        return `file-${i + 1}.txt`;
      }),
      async (filename) => fs.outputFile(localDir.absolute(`tmp/${filename}`), filename),
    );

    // give the watcher a chance to see the changes
    await sleep(timeoutMs("1s"));

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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}}}",
            ".ignore": "**/tmp",
            "tmp/": "",
            "tmp/file-01.txt": "file-01.txt",
            "tmp/file-02.txt": "file-02.txt",
            "tmp/file-03.txt": "file-03.txt",
            "tmp/file-04.txt": "file-04.txt",
            "tmp/file-05.txt": "file-05.txt",
            "tmp/file-06.txt": "file-06.txt",
            "tmp/file-07.txt": "file-07.txt",
            "tmp/file-08.txt": "file-08.txt",
            "tmp/file-09.txt": "file-09.txt",
            "tmp/file-10.txt": "file-10.txt",
          },
        }
      `);
  });

  it("doesn't send changes from the local filesystem to gadget if the directory matches a directory-only ignore pattern", async () => {
    const { localDir, expectDirs } = await makeSyncScenario({
      filesVersion1Files: {
        ".ignore": "build/",
      },
      gadgetFiles: {
        ".ignore": "build/",
      },
      localFiles: {
        ".ignore": "build/",
      },
    });

    await dev.run(testCtx, args);

    // add files inside the ignored directory
    await fs.outputFile(localDir.absolute("build/output.js"), "compiled");
    await fs.outputFile(localDir.absolute("build/index.css"), "styles");

    // add a nested directory inside the ignored directory
    await fs.outputFile(localDir.absolute("build/chunks/vendor.js"), "vendor");

    // give the watcher a chance to see the changes
    await sleep(timeoutMs("1s"));

    await expectDirs().resolves.toMatchInlineSnapshot(`
        {
          "filesVersionDirs": {
            "1": {
              ".gadget/": "",
              ".ignore": "build/",
            },
          },
          "gadgetDir": {
            ".gadget/": "",
            ".ignore": "build/",
          },
          "localDir": {
            ".gadget/": "",
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}}}",
            ".ignore": "build/",
            "build/": "",
            "build/chunks/": "",
            "build/chunks/vendor.js": "vendor",
            "build/index.css": "styles",
            "build/output.js": "compiled",
          },
        }
      `);
  });

  it("reloads the ignore file when .ignore changes", async () => {
    const { filesync, waitUntilLocalFilesVersion, localDir, waitUntilGadgetFilesVersion, emitGadgetChanges, expectDirs } =
      await makeSyncScenario();

    await dev.run(testCtx, args);

    vi.spyOn(filesync.syncJson.directory, "loadIgnoreFile");

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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
            ".ignore": "# watch it all",
          },
        }
      `);

    await vi.waitFor(() => {
      expect(filesync.syncJson.directory.loadIgnoreFile).toHaveBeenCalledTimes(1);
    });

    await emitGadgetChanges({
      remoteFilesVersion: "3",
      changed: [makeFile({ path: ".ignore", content: "tmp" })],
      deleted: [],
    });

    await waitUntilLocalFilesVersion(3n);

    expect(filesync.syncJson.directory.loadIgnoreFile).toHaveBeenCalledTimes(2);
  });

  it("clears ignore patterns when .ignore is deleted remotely", async () => {
    const { filesync, waitUntilLocalFilesVersion, emitGadgetChanges } = await makeSyncScenario({
      filesVersion1Files: {
        ".ignore": "tmp/",
      },
      localFiles: {
        ".gadget/": "",
        ".ignore": "tmp/",
      },
      gadgetFiles: {
        ".ignore": "tmp/",
      },
    });

    await dev.run(testCtx, args);

    expect(filesync.syncJson.directory.ignores("tmp/foo.js", false)).toBe(true);

    vi.spyOn(filesync.syncJson.directory, "loadIgnoreFile");

    await emitGadgetChanges({
      remoteFilesVersion: "2",
      changed: [],
      deleted: [{ path: ".ignore" }],
    });

    await waitUntilLocalFilesVersion(2n);

    expect(filesync.syncJson.directory.loadIgnoreFile).toHaveBeenCalledTimes(1);
    expect(filesync.syncJson.directory.ignores("tmp/foo.js", false)).toBe(false);
  });

  it("notifies the user when an error occurs", async () => {
    const { expectGadgetChangesSubscription } = await makeSyncScenario();

    await dev.run(testCtx, args);

    const error = new ClientError(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION, "test");

    const gadgetChangesSubscription = expectGadgetChangesSubscription();
    await gadgetChangesSubscription.emitError(error);

    await waitForReportErrorAndExit(error);

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
    mock(which, () => Promise.resolve(null as any));
    await expect(dev.run(testCtx, args)).rejects.toThrow(YarnNotFoundError);
  });

  it("does not throw YarnNotFoundError if yarn is found", async () => {
    await makeSyncScenario();
    mock(which, () => Promise.resolve("/path/to/yarn"));
    await dev.run(testCtx, args);
  });
});
