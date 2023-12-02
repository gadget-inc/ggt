import { execa } from "execa";
import fs from "fs-extra";
import ms from "ms";
import nock from "nock";
import notifier from "node-notifier";
import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import which from "which";
import { command as sync } from "../../src/commands/sync.js";
import {
  PUBLISH_FILE_SYNC_EVENTS_MUTATION,
  REMOTE_FILES_VERSION_QUERY,
  REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
} from "../../src/services/app/edit-graphql.js";
import { Context } from "../../src/services/command/context.js";
import { assetsPath } from "../../src/services/config/paths.js";
import { ClientError, YarnNotFoundError } from "../../src/services/error/error.js";
import { FileSync } from "../../src/services/filesync/filesync.js";
import * as prompt from "../../src/services/output/prompt.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import { nockTestApps, testApp } from "../__support__/app.js";
import { log } from "../__support__/debug.js";
import type { MockEditGraphQL } from "../__support__/edit-graphql.js";
import { createMockEditGraphQL, nockEditGraphQLResponse } from "../__support__/edit-graphql.js";
import { expectReportErrorAndExit } from "../__support__/error.js";
import { expectDir, writeDir } from "../__support__/files.js";
import { expectPublishVariables, makeDir, makeFile, stateFile } from "../__support__/filesync.js";
import { prettyJSON } from "../__support__/json.js";
import { testDirPath } from "../__support__/paths.js";
import { sleep, sleepUntil } from "../__support__/sleep.js";
import { loginTestUser } from "../__support__/user.js";

describe("sync", () => {
  let appDir: string;
  let appDirPath: (...segments: string[]) => string;
  let filesync: FileSync;
  let mockEditGraphQL: MockEditGraphQL;
  let ctx: Context;

  beforeEach(() => {
    loginTestUser();
    nockTestApps();
    mockEditGraphQL = createMockEditGraphQL();

    appDirPath = (...segments: string[]) => testDirPath("app", ...segments);
    appDir = appDirPath();

    ctx = new Context({
      _: [
        appDir,
        "--app",
        testApp.slug,
        "--file-push-delay",
        "10", // default 100ms
        "--file-watch-debounce",
        "300", // default 300ms
        "--file-watch-poll-interval",
        "30", // default 3_000ms
        "--file-watch-poll-timeout",
        "20", // default 20_000ms
        "--file-watch-rename-timeout",
        "50", // default 1_250ms
      ],
    });

    const originalInit = FileSync.init;
    vi.spyOn(FileSync, "init").mockImplementation(async (args) => {
      try {
        filesync = await originalInit(args);
        return filesync;
      } catch (error) {
        log.error("failed to initialize filesync", { error });
        process.exit(1);
      }
    });

    vi.spyOn(prompt, "confirm").mockImplementation(() => {
      log.error("prompt.confirm() should not be called");
      process.exit(1);
    });

    vi.spyOn(prompt, "select").mockImplementation(() => {
      log.error("prompt.select() should not be called");
      process.exit(1);
    });
  });

  afterEach(() => {
    ctx.abort();
    expect(nock.pendingMocks()).toEqual([]);
  });

  it("writes changes from gadget to the local filesystem", async () => {
    await sync(ctx);

    const gadgetChangesSubscription = mockEditGraphQL.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);

    // receive a new file
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "1",
          changed: [makeFile({ path: "file.js", content: "foo" })],
          deleted: [],
        },
      },
    });

    await sleepUntil(() => filesync.filesVersion === 1n);

    await expectDir(appDir, {
      ".gadget/": "",
      ".gadget/sync.json": stateFile(filesync),
      "file.js": "foo",
    });

    // receive an update to a file
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "2",
          changed: [makeFile({ path: "file.js", content: "foo v2" })],
          deleted: [],
        },
      },
    });

    await sleepUntil(() => filesync.filesVersion === 2n);

    await expectDir(appDir, {
      ".gadget/": "",
      ".gadget/sync.json": stateFile(filesync),
      "file.js": "foo v2",
    });

    // receive a delete to a file
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "3",
          changed: [],
          deleted: [{ path: "file.js" }],
        },
      },
    });

    await sleepUntil(() => filesync.filesVersion === 3n);

    await expectDir(appDir, {
      ".gadget/": "",
      ".gadget/sync.json": stateFile(filesync),
      ".gadget/backup/": "",
      ".gadget/backup/file.js": "foo v2",
    });

    // receive a new directory
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "4",
          changed: [makeDir({ path: "directory/" })],
          deleted: [],
        },
      },
    });

    await sleepUntil(() => filesync.filesVersion === 4n);

    await expectDir(appDir, {
      ".gadget/": "",
      ".gadget/sync.json": stateFile(filesync),
      ".gadget/backup/": "",
      ".gadget/backup/file.js": "foo v2",
      "directory/": "",
    });

    // receive a delete to a directory
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "5",
          changed: [],
          deleted: [{ path: "directory/" }],
        },
      },
    });

    await sleepUntil(() => filesync.filesVersion === 5n);

    await expectDir(appDir, {
      ".gadget/": "",
      ".gadget/sync.json": stateFile(filesync),
      ".gadget/backup/": "",
      ".gadget/backup/file.js": "foo v2",
      ".gadget/backup/directory/": "",
    });

    // receive a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.js`);
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "6",
          changed: files.map((filename) => makeFile({ path: filename, content: filename })),
          deleted: [],
        },
      },
    });

    await sleepUntil(() => filesync.filesVersion === 6n);

    await expectDir(appDir, {
      ".gadget/": "",
      ".gadget/sync.json": stateFile(filesync),
      ".gadget/backup/": "",
      ".gadget/backup/file.js": "foo v2",
      ".gadget/backup/directory/": "",
      ...files.reduce((acc, filename) => ({ ...acc, [filename]: filename }), {}),
    });
  });

  it("writes changes from gadget in the order they were received", async () => {
    // this test is exactly the same as the previous one, except we just
    // wait for the final filesVersion and expect the same result
    await sync(ctx);

    const gadgetChangesSubscription = mockEditGraphQL.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);

    // receive a new file
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "1",
          changed: [makeFile({ path: "file.js", content: "foo" })],
          deleted: [],
        },
      },
    });

    // receive an update to a file
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "2",
          changed: [makeFile({ path: "file.js", content: "foo v2" })],
          deleted: [],
        },
      },
    });

    // receive a delete to a file
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "3",
          changed: [],
          deleted: [{ path: "file.js" }],
        },
      },
    });

    // receive a new directory
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "4",
          changed: [makeDir({ path: "directory/" })],
          deleted: [],
        },
      },
    });

    // receive a delete to a directory
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "5",
          changed: [],
          deleted: [{ path: "directory/" }],
        },
      },
    });

    // receive a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.js`);
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "6",
          changed: files.map((filename) => makeFile({ path: filename, content: filename })),
          deleted: [],
        },
      },
    });

    await sleepUntil(() => filesync.filesVersion === 6n);

    await expectDir(appDir, {
      ".gadget/": "",
      ".gadget/sync.json": stateFile(filesync),
      ".gadget/backup/": "",
      ".gadget/backup/file.js": "foo v2",
      ".gadget/backup/directory/": "",
      ...files.reduce((acc, filename) => ({ ...acc, [filename]: filename }), {}),
    });
  });

  it("writes all received files before stopping", async () => {
    // this test is exactly the same as the previous one, except we just
    // wait for stop() to finish and expect the same result
    let stop: (() => Promise<void>) | undefined = undefined;
    vi.spyOn(ctx.signal, "addEventListener").mockImplementationOnce((_, listener) => {
      stop = listener as () => Promise<void>;
    });

    await sync(ctx);

    const gadgetChangesSubscription = mockEditGraphQL.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);

    // receive a new file
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "1",
          changed: [makeFile({ path: "file.js", content: "foo" })],
          deleted: [],
        },
      },
    });

    // receive an update to a file
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "2",
          changed: [makeFile({ path: "file.js", content: "foo v2" })],
          deleted: [],
        },
      },
    });

    // receive a delete to a file
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "3",
          changed: [],
          deleted: [{ path: "file.js" }],
        },
      },
    });

    // receive a new directory
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "4",
          changed: [makeDir({ path: "directory/" })],
          deleted: [],
        },
      },
    });

    // receive a delete to a directory
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "5",
          changed: [],
          deleted: [{ path: "directory/" }],
        },
      },
    });

    // receive a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.js`);
    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "6",
          changed: files.map((filename) => makeFile({ path: filename, content: filename })),
          deleted: [],
        },
      },
    });

    ctx.abort();
    await stop!();

    await expectDir(appDir, {
      ".gadget/": "",
      ".gadget/sync.json": stateFile(filesync),
      ".gadget/backup/": "",
      ".gadget/backup/file.js": "foo v2",
      ".gadget/backup/directory/": "",
      ...files.reduce((acc, filename) => ({ ...acc, [filename]: filename }), {}),
    });
  });

  it("doesn't write changes from gadget to the local filesystem if the file is ignored", async () => {
    void nockEditGraphQLResponse({ query: REMOTE_FILES_VERSION_QUERY, response: { data: { remoteFilesVersion: "0" } } });
    await writeDir(appDir, {
      ".gadget/sync.json": prettyJSON({ app: testApp.slug, filesVersion: "0", mtime: Date.now() + ms("1s") }),
      ".ignore": "tmp",
      "tmp/file.js": "foo",
      "tmp/file2.js": "bar",
    });

    await sync(ctx);

    const gadgetChangesSubscription = mockEditGraphQL.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);

    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "1",
          changed: [makeFile({ path: "tmp/file.js", content: "foo changed" })],
          deleted: [{ path: "tmp/file2.js" }],
        },
      },
    });

    // it should still update the filesVersion
    await sleepUntil(() => filesync.filesVersion === 1n);

    await expectDir(appDir, {
      ".gadget/": "",
      ".gadget/sync.json": stateFile(filesync),
      ".ignore": "tmp",
      "tmp/": "",
      "tmp/file.js": "foo",
      "tmp/file2.js": "bar",
    });
  });

  it("sends changes from the local filesystem to gadget", async () => {
    await sync(ctx);

    // add a file
    let published = nockEditGraphQLResponse({
      query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: { data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } },
      expectVariables: expectPublishVariables({
        input: {
          expectedRemoteFilesVersion: "0",
          changed: [makeFile({ path: "file.js", content: "foo" })],
          deleted: [],
        },
      }),
    });

    await fs.outputFile(appDirPath("file.js"), "foo");
    await published;

    // update a file
    published = nockEditGraphQLResponse({
      query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: { data: { publishFileSyncEvents: { remoteFilesVersion: "2" } } },
      expectVariables: expectPublishVariables({
        input: {
          expectedRemoteFilesVersion: "1",
          changed: [makeFile({ path: "file.js", content: "foo v2" })],
          deleted: [],
        },
      }),
    });

    await fs.outputFile(appDirPath("file.js"), "foo v2");
    await published;

    // move a file
    published = nockEditGraphQLResponse({
      query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: { data: { publishFileSyncEvents: { remoteFilesVersion: "3" } } },
      expectVariables: expectPublishVariables({
        input: {
          expectedRemoteFilesVersion: "2",
          changed: [makeFile({ oldPath: "file.js", path: "renamed-file.js", content: "foo v2" })],
          deleted: [],
        },
      }),
    });

    await fs.move(appDirPath("file.js"), appDirPath("renamed-file.js"));
    await published;

    // delete a file
    published = nockEditGraphQLResponse({
      query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: { data: { publishFileSyncEvents: { remoteFilesVersion: "4" } } },
      expectVariables: expectPublishVariables({
        input: {
          expectedRemoteFilesVersion: "3",
          changed: [],
          deleted: [{ path: "renamed-file.js" }],
        },
      }),
    });

    await fs.remove(appDirPath("renamed-file.js"));
    await published;

    // add a directory
    published = nockEditGraphQLResponse({
      query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: { data: { publishFileSyncEvents: { remoteFilesVersion: "5" } } },
      expectVariables: expectPublishVariables({
        input: {
          expectedRemoteFilesVersion: "4",
          changed: [makeDir({ path: "directory/" })],
          deleted: [],
        },
      }),
    });

    await fs.mkdir(appDirPath("directory"));
    await published;

    // rename a directory
    published = nockEditGraphQLResponse({
      query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: { data: { publishFileSyncEvents: { remoteFilesVersion: "6" } } },
      expectVariables: expectPublishVariables({
        input: {
          expectedRemoteFilesVersion: "5",
          changed: [makeDir({ oldPath: "directory/", path: "renamed-directory/" })],
          deleted: [],
        },
      }),
    });

    await fs.move(appDirPath("directory"), appDirPath("renamed-directory"));
    await published;

    // delete a directory
    published = nockEditGraphQLResponse({
      query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: { data: { publishFileSyncEvents: { remoteFilesVersion: "7" } } },
      expectVariables: expectPublishVariables({
        input: {
          expectedRemoteFilesVersion: "6",
          changed: [],
          deleted: [{ path: "renamed-directory/" }],
        },
      }),
    });

    await fs.remove(appDirPath("renamed-directory"));
    await published;

    // add a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.js`);
    published = nockEditGraphQLResponse({
      query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: { data: { publishFileSyncEvents: { remoteFilesVersion: "8" } } },
      expectVariables: expectPublishVariables({
        input: {
          expectedRemoteFilesVersion: "7",
          changed: files.map((filename) => makeFile({ path: filename, content: filename })),
          deleted: [],
        },
      }),
    });

    // sleep a bit between each one to simulate a slow filesystem
    for (const filename of files) {
      await fs.outputFile(appDirPath(filename), filename);
      await sleep("5ms");
    }

    await published;
  });

  it("doesn't send multiple changes to the same file at once", async () => {
    await sync(ctx);

    // add a file
    const published = nockEditGraphQLResponse({
      query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: { data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } },
      expectVariables: expectPublishVariables({
        input: {
          expectedRemoteFilesVersion: "0",
          changed: [makeFile({ path: "file.js", content: "v10" })],
          deleted: [],
        },
      }),
    });

    for (let i = 0; i < 10; i++) {
      await fs.outputFile(appDirPath("file.js"), `v${i + 1}`);
    }

    await published;
  });

  it("doesn't send changes from the local filesystem to gadget if the file is ignored", async () => {
    void nockEditGraphQLResponse({ query: REMOTE_FILES_VERSION_QUERY, response: { data: { remoteFilesVersion: "0" } } });
    await writeDir(appDir, {
      ".gadget/sync.json": prettyJSON({ app: testApp.slug, filesVersion: "0", mtime: Date.now() + ms("1s") }),
      ".ignore": "tmp",
    });

    await sync(ctx);

    vi.spyOn(filesync, "sendChangesToGadget");

    // add a file
    await fs.outputFile(appDirPath("tmp/file.js"), "foo");
    // update a file
    await fs.outputFile(appDirPath("tmp/file.js"), "foo v2");
    // move a file
    await fs.move(appDirPath("tmp/file.js"), appDirPath("tmp/renamed-file.js"));
    // delete a file
    await fs.remove(appDirPath("tmp/renamed-file.js"));
    // add a directory
    await fs.mkdir(appDirPath("tmp/directory"));
    // rename a directory
    await fs.move(appDirPath("tmp/directory"), appDirPath("tmp/renamed-directory"));
    // delete a directory
    await fs.remove(appDirPath("tmp/renamed-directory"));
    // add a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.js`);
    for (const filename of files) {
      await fs.outputFile(appDirPath(`tmp/${filename}`), filename);
    }

    await sleep("1s");
    expect(filesync.sendChangesToGadget).not.toHaveBeenCalled();
  });

  it("runs `yarn install --check-files` when yarn.lock changes", async () => {
    const execaCalled = new PromiseSignal();
    execa.mockImplementationOnce(() => {
      execaCalled.resolve();
      return Promise.resolve({});
    });

    await sync(ctx);

    const gadgetChangesSubscription = mockEditGraphQL.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);

    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "1",
          changed: [makeFile({ path: "yarn.lock", content: "# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY." })],
          deleted: [],
        },
      },
    });

    await execaCalled;

    expect(filesync.filesVersion).toBe(1n);
    expect(execa.mock.lastCall).toEqual(["yarn", ["install", "--check-files"], { cwd: appDir }]);
  });

  it("reloads the ignore file when .ignore changes", async () => {
    await sync(ctx);

    vi.spyOn(filesync.directory, "loadIgnoreFile");

    const published = nockEditGraphQLResponse({
      query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: { data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } },
      expectVariables: expectPublishVariables({
        input: {
          expectedRemoteFilesVersion: "0",
          changed: [makeFile({ path: ".ignore", content: "# watch it all" })],
          deleted: [],
        },
      }),
    });

    await fs.outputFile(appDirPath(".ignore"), "# watch it all");
    await published;

    expect(filesync.directory.loadIgnoreFile).toHaveBeenCalledTimes(1);

    const gadgetChangesSubscription = mockEditGraphQL.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);

    gadgetChangesSubscription.emitNext({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "2",
          changed: [makeFile({ path: ".ignore", content: "tmp" })],
          deleted: [],
        },
      },
    });

    await sleepUntil(() => filesync.filesVersion === 2n);

    expect(filesync.directory.loadIgnoreFile).toHaveBeenCalledTimes(2);
  });

  it("notifies the user when an error occurs", async () => {
    await sync(ctx);

    const error = new ClientError({} as any, "test");

    const gadgetChangesSubscription = mockEditGraphQL.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);
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
    which.sync.mockReturnValue(undefined);

    await expect(sync(ctx)).rejects.toThrow(YarnNotFoundError);
  });

  it("does not throw YarnNotFoundError if yarn is found", async () => {
    which.sync.mockReturnValue("/path/to/yarn");
    await sync(ctx);
  });

  it.todo("sends all changes before stopping");
});
