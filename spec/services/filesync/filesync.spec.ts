import { execa } from "execa";
import fs from "fs-extra";
import { GraphQLError } from "graphql";
import nock from "nock";
import { randomUUID } from "node:crypto";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import { FileSyncEncoding } from "../../../src/__generated__/graphql.js";
import { args as DevArgs } from "../../../src/commands/dev.js";
import { args as PullArgs } from "../../../src/commands/pull.js";
import { args as PushArgs } from "../../../src/commands/push.js";
import { PUBLISH_FILE_SYNC_EVENTS_MUTATION, type GraphQLQuery } from "../../../src/services/app/edit/operation.js";
import { GadgetError } from "../../../src/services/app/error.js";
import type { Context } from "../../../src/services/command/context.js";
import { Changes } from "../../../src/services/filesync/changes.js";
import { supportsPermissions, type Directory } from "../../../src/services/filesync/directory.js";
import { TooManySyncAttemptsError, isFilesVersionMismatchError } from "../../../src/services/filesync/error.js";
import { FileSync } from "../../../src/services/filesync/filesync.js";
import { MergeConflictPreference as ConflictPreference } from "../../../src/services/filesync/strategy.js";
import { SyncJson, loadSyncJsonDirectory, type SyncJsonArgs } from "../../../src/services/filesync/sync-json.js";
import { confirm, select } from "../../../src/services/output/prompt.js";
import { noop } from "../../../src/services/util/function.js";
import { PromiseSignal } from "../../../src/services/util/promise.js";
import { nockTestApps, testApp } from "../../__support__/app.js";
import { makeContext } from "../../__support__/context.js";
import { expectError } from "../../__support__/error.js";
import { expectDir, writeDir } from "../../__support__/files.js";
import { defaultFileMode, expectPublishVariables, expectSyncJson, makeFile, makeSyncScenario } from "../../__support__/filesync.js";
import { nockEditResponse } from "../../__support__/graphql.js";
import { mock, mockOnce } from "../../__support__/mock.js";
import { testDirPath } from "../../__support__/paths.js";
import { expectProcessExit } from "../../__support__/process.js";
import { expectStdout } from "../../__support__/stream.js";
import { mockSystemTime } from "../../__support__/time.js";
import { loginTestUser } from "../../__support__/user.js";

describe("FileSync._writeToLocalFilesystem", () => {
  let ctx: Context<SyncJsonArgs>;
  let localDir: Directory;
  let syncJson: SyncJson;
  let filesync: FileSync;

  // @ts-expect-error _writeToLocalFilesystem is private
  let writeToLocalFilesystem: typeof FileSync.prototype._writeToLocalFilesystem;

  beforeEach(async () => {
    loginTestUser();
    nockTestApps();

    ctx = makeContext({ parse: DevArgs, argv: ["dev", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`] });
    localDir = await loadSyncJsonDirectory(testDirPath("local"));
    syncJson = await SyncJson.loadOrInit(ctx, { directory: localDir });
    filesync = new FileSync(syncJson);

    // @ts-expect-error _writeToLocalFilesystem is private
    writeToLocalFilesystem = filesync._writeToLocalFilesystem.bind(filesync);
  });

  it("writes files", async () => {
    await writeToLocalFilesystem(ctx, {
      filesVersion: 1n,
      files: [
        makeFile({ path: "file.js", content: "foo", mode: 0o644 }),
        makeFile({ path: "some/deeply/nested/file.js", content: "bar", mode: 0o755 }),
      ],
      delete: [],
    });

    await expectDir(localDir, {
      ".gadget/": "",
      ".gadget/sync.json": expectSyncJson(filesync),
      "file.js": "foo",
      "some/": "",
      "some/deeply/": "",
      "some/deeply/nested/": "",
      "some/deeply/nested/file.js": "bar",
    });

    expect(filesync.syncJson.filesVersion).toBe(1n);

    if (supportsPermissions) {
      const fileStat = await fs.stat(localDir.absolute("file.js"));
      expect(fileStat.mode & 0o777).toBe(0o644);

      const nestedFileStat = await fs.stat(localDir.absolute("some/deeply/nested/file.js"));
      expect(nestedFileStat.mode & 0o777).toBe(0o755);
    }
  });

  it("writes empty directories", async () => {
    await writeToLocalFilesystem(ctx, {
      filesVersion: 1n,
      files: [makeFile({ path: "some/deeply/nested/" })],
      delete: [],
    });

    await expectDir(localDir, {
      ".gadget/": "",
      ".gadget/sync.json": expectSyncJson(filesync),
      "some/": "",
      "some/deeply/": "",
      "some/deeply/nested/": "",
    });

    expect(filesync.syncJson.filesVersion).toBe(1n);
  });

  it("deletes files", async () => {
    await writeDir(localDir, {
      "file.js": "foo",
      "some/deeply/nested/file.js": "bar",
    });

    await expectDir(localDir, {
      "file.js": "foo",
      "some/": "",
      "some/deeply/": "",
      "some/deeply/nested/": "",
      "some/deeply/nested/file.js": "bar",
    });

    await writeToLocalFilesystem(ctx, {
      filesVersion: 1n,
      files: [],
      delete: ["file.js", "some/deeply/nested/file.js"],
    });

    await expectDir(localDir, {
      ".gadget/": "",
      ".gadget/sync.json": expectSyncJson(filesync),
      ".gadget/backup/": "",
      ".gadget/backup/file.js": "foo",
      ".gadget/backup/some/": "",
      ".gadget/backup/some/deeply/": "",
      ".gadget/backup/some/deeply/nested/": "",
      ".gadget/backup/some/deeply/nested/file.js": "bar",
      "some/": "",
      "some/deeply/": "",
      "some/deeply/nested/": "",
    });

    expect(filesync.syncJson.filesVersion).toBe(1n);
  });

  it("updates `state.filesVersion` even if nothing changed", async () => {
    expect(filesync.syncJson.filesVersion).toBe(0n);

    await writeToLocalFilesystem(ctx, {
      filesVersion: 1n,
      files: [],
      delete: [],
    });

    expect(filesync.syncJson.filesVersion).toBe(1n);
  });

  it("does not throw ENOENT errors when deleting files", async () => {
    await writeToLocalFilesystem(ctx, {
      filesVersion: 1n,
      files: [],
      delete: ["does/not/exist.js"],
    });

    expect(filesync.syncJson.filesVersion).toBe(1n);
  });

  it("deletes files before writing files", async () => {
    await writeDir(localDir, {
      "foo/": "",
    });

    // emit an event that both deletes a directory and changes a file in
    // that directory
    await writeToLocalFilesystem(ctx, {
      filesVersion: 1n,
      files: [makeFile({ path: "foo/baz.js", content: "// baz.js" })],
      delete: ["foo/"],
    });

    await expectDir(localDir, {
      ".gadget/": "",
      ".gadget/sync.json": expectSyncJson(filesync),
      ".gadget/backup/": "",
      // the directory should have been deleted
      ".gadget/backup/foo/": "",
      // but the directory should still exist because a file was added to it
      "foo/": "",
      "foo/baz.js": "// baz.js",
    });

    expect(filesync.syncJson.filesVersion).toBe(1n);
  });

  it("reloads the ignore file when it changes", async () => {
    await writeDir(localDir, {
      ".ignore": "file2.js",
      "file1.js": "one",
      "file3.js": "three",
    });

    await filesync.syncJson.directory.loadIgnoreFile();

    expect(filesync.syncJson.directory.ignores("file2.js")).toBe(true);

    await writeToLocalFilesystem(ctx, {
      filesVersion: 1n,
      files: [makeFile({ path: ".ignore", content: "" })],
      delete: [],
    });

    expect(filesync.syncJson.directory.ignores("file2.js")).toBe(false);
  });

  it("removes old backup files before moving new files into place", async () => {
    // create a file named `foo.js`
    await fs.outputFile(filesync.syncJson.directory.absolute("foo.js"), "// foo");

    // create a directory named `.gadget/backup/foo.js`
    await fs.mkdirp(filesync.syncJson.directory.absolute(".gadget/backup/foo.js"));

    // tell filesync to delete foo.js, which should move it to
    // .gadget/backup/foo.js if the backup file is not removed first,
    // this will fail with "Error: Cannot overwrite directory"
    await writeToLocalFilesystem(ctx, { filesVersion: 1n, files: [], delete: ["foo.js"] });

    await expectDir(localDir, {
      ".gadget/": "",
      ".gadget/sync.json": expectSyncJson(filesync),
      ".gadget/backup/": "",
      ".gadget/backup/foo.js": "// foo",
    });
  });

  it("ensures the filesVersion is greater than or equal to the current filesVersion", async () => {
    expect(filesync.syncJson.filesVersion).toBe(0n);

    await writeToLocalFilesystem(ctx, {
      filesVersion: 1n,
      files: [],
      delete: [],
    });

    expect(filesync.syncJson.filesVersion).toBe(1n);

    await writeToLocalFilesystem(ctx, {
      filesVersion: 1n,
      files: [],
      delete: [],
    });

    expect(filesync.syncJson.filesVersion).toBe(1n);

    await expect(() =>
      writeToLocalFilesystem(ctx, {
        filesVersion: 0n,
        files: [],
        delete: [],
      }),
    ).rejects.toThrow("filesVersion must be greater than or equal to current filesVersion");
  });

  it("runs `yarn install --check-files` when yarn.lock changes", async () => {
    const execaCalled = new PromiseSignal();
    mock(execa, () => {
      execaCalled.resolve();
      return Promise.resolve({}) as never;
    });

    await writeToLocalFilesystem(ctx, {
      filesVersion: 1n,
      files: [makeFile({ path: "yarn.lock", content: "# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY." })],
      delete: [],
    });

    await execaCalled;

    assert(vi.isMockFunction(execa));
    expect(execa.mock.lastCall).toEqual(["yarn", ["install", "--check-files"], { cwd: localDir.path }]);
  });

  it("does not run `yarn install --check-files` when yarn.lock does not change", async () => {
    await writeToLocalFilesystem(ctx, {
      filesVersion: 1n,
      files: [],
      delete: [],
    });

    assert(vi.isMockFunction(execa));
    expect(execa.mock.calls).toEqual([]);
  });

  it("swallows `yarn install --check-files` errors", async () => {
    const execaCalled = new PromiseSignal();
    mock(execa, () => {
      execaCalled.resolve();
      return Promise.reject(new Error("Boom!")) as never;
    });

    await expect(
      writeToLocalFilesystem(ctx, {
        filesVersion: 1n,
        files: [makeFile({ path: "yarn.lock", content: "# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY." })],
        delete: [],
      }),
    ).resolves.not.toThrow();

    await execaCalled;

    assert(vi.isMockFunction(execa));
    expect(execa.mock.lastCall).toEqual(["yarn", ["install", "--check-files"], { cwd: localDir.path }]);
  });
});

describe("FileSync._sendChangesToGadget", () => {
  mockSystemTime();

  let ctx: Context<SyncJsonArgs>;
  let localDir: Directory;
  let syncJson: SyncJson;
  let filesync: FileSync;

  // @ts-expect-error _sendChangesToGadget is private
  let sendChangesToGadget: typeof FileSync.prototype._sendChangesToGadget;

  beforeEach(async () => {
    loginTestUser();
    nockTestApps();

    ctx = makeContext({ parse: DevArgs, argv: ["dev", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`] });
    localDir = await loadSyncJsonDirectory(testDirPath("local"));
    syncJson = await SyncJson.loadOrInit(ctx, { directory: localDir });
    filesync = new FileSync(syncJson);

    // @ts-expect-error _sendChangesToGadget is private
    sendChangesToGadget = filesync._sendChangesToGadget.bind(filesync);
  });

  it("sends changed files to gadget", async () => {
    await writeDir(localDir, {
      "file.txt": "file",
      "some/nested/file.txt": "some nested file",
    });

    const changes = new Changes();
    changes.set("file.txt", { type: "create" });
    changes.set("some/nested/file.txt", { type: "update" });
    changes.set("some/nested/other-file.txt", { type: "delete" });

    const scope = nockEditResponse({
      operation: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      expectVariables: expectPublishVariables({
        input: {
          expectedRemoteFilesVersion: "0",
          changed: [
            {
              path: "file.txt",
              content: Buffer.from("file").toString("base64"),
              mode: defaultFileMode,
              encoding: FileSyncEncoding.Base64,
            },
            {
              path: "some/nested/file.txt",
              content: Buffer.from("some nested file").toString("base64"),
              mode: defaultFileMode,
              encoding: FileSyncEncoding.Base64,
            },
          ],
          deleted: [{ path: "some/nested/other-file.txt" }],
        },
      }),
      response: {
        data: {
          publishFileSyncEvents: {
            remoteFilesVersion: "1",
            problems: [],
          },
        },
      },
    });

    await sendChangesToGadget(ctx, { changes });

    expect(scope.isDone()).toBe(true);
  });

  it("doesn't send changed files to gadget if the changed files have been deleted", async () => {
    expect(nock.pendingMocks()).toEqual([]);

    const changes = new Changes();
    changes.set("does/not/exist.js", { type: "create" });
    changes.set("also/does/not/exist.js", { type: "update" });

    await sendChangesToGadget(ctx, { changes });

    expect(nock.pendingMocks()).toEqual([]);
  });

  it("retries failed graphql requests", async () => {
    await writeDir(localDir, {
      "foo.js": "// foo",
    });

    const changes = new Changes();
    changes.set("foo.js", { type: "create" });

    const scope = nockEditResponse({
      operation: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: {},
      expectVariables: expect.anything(),
      times: 2,
      statusCode: 500,
    });

    nockEditResponse({
      operation: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: { data: { publishFileSyncEvents: { remoteFilesVersion: "1", problems: [] } } },
      expectVariables: expect.anything(),
      statusCode: 200,
    });

    await expect(sendChangesToGadget(ctx, { changes })).resolves.not.toThrow();

    expect(scope.isDone()).toBe(true);
  });

  it('does not retry "Files version mismatch" errors', async () => {
    await writeDir(localDir, {
      "foo.js": "// foo",
    });

    const changes = new Changes();
    changes.set("foo.js", { type: "create" });

    const scope = nockEditResponse({
      operation: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: { errors: [new GraphQLError("Files version mismatch")] },
      expectVariables: expect.anything(),
      times: 1,
      statusCode: 500,
    });

    const error = await expectError(() => sendChangesToGadget(ctx, { changes }));

    expect(scope.isDone()).toBe(true);

    expect(isFilesVersionMismatchError(error)).toBe(true);
  });

  it('throws "Files version mismatch" when it receives a files version greater than the expectedRemoteFilesVersion + 1', async () => {
    const scope = nockEditResponse({
      operation: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: { data: { publishFileSyncEvents: { remoteFilesVersion: "2", problems: [] } } },
      expectVariables: expectPublishVariables({
        input: {
          expectedRemoteFilesVersion: "0",
          changed: [
            {
              path: "foo.js",
              content: Buffer.from("// foo").toString("base64"),
              mode: defaultFileMode,
              encoding: FileSyncEncoding.Base64,
            },
          ],
          deleted: [],
        },
      }),
    });

    await writeDir(localDir, {
      "foo.js": "// foo",
    });

    const changes = new Changes();
    changes.set("foo.js", { type: "create" });

    const error = await expectError(() => sendChangesToGadget(ctx, { changes }));

    expect(scope.isDone()).toBe(true);

    expect(isFilesVersionMismatchError(error)).toBe(true);
  });

  it("prints fatal errors when they're received", async () => {
    await writeDir(localDir, {
      "access-control.gadget.ts": "// foo",
    });

    nockEditResponse({
      operation: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: {
        data: {
          publishFileSyncEvents: {
            remoteFilesVersion: "1",
            problems: [
              {
                type: "SourceFile",
                path: "access-control.gadget.ts",
                message: "Something went wrong",
                level: "Fatal",
              },
              {
                type: "SourceFile",
                path: "access-control.gadget.ts",
                message: "Another message",
                level: "Fatal",
              },
              {
                type: "SourceFile",
                path: "settings.gadget.ts",
                message: "Message from another file",
                level: "Fatal",
              },
            ],
          },
        },
      },
      expectVariables: expect.anything(),
      times: 1,
      statusCode: 200,
    });

    const changes = new Changes();
    changes.set("access-control.gadget.ts", { type: "update" });

    await sendChangesToGadget(ctx, { changes });

    expectStdout().toMatchSnapshot();
  });
});

describe("FileSync.mergeChangesWithGadget", () => {
  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  it('syncs when it receives "Files version mismatch" from Gadget', async () => {
    const { ctx, filesync, expectDirs } = await makeSyncScenario({
      localFiles: { "local.txt": "// local" },
      gadgetFiles: { "gadget.txt": "// gadget" },
    });

    const changes = new Changes();
    changes.set("local.txt", { type: "create" });

    await filesync.mergeChangesWithGadget(ctx, { changes });

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "gadget.txt": "// gadget",
          },
          "3": {
            ".gadget/": "",
            "gadget.txt": "// gadget",
            "local.txt": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "gadget.txt": "// gadget",
          "local.txt": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
          "gadget.txt": "// gadget",
          "local.txt": "// local",
        },
      }
    `);
  });

  it('syncs when it receives "Files version mismatch" from files version greater than the expectedRemoteFilesVersion + 1', async () => {
    const { ctx, filesync, expectDirs, changeGadgetFiles } = await makeSyncScenario({
      localFiles: { "local.txt": "// local" },
      gadgetFiles: { "gadget.txt": "// gadget" },
      beforePublishFileSyncEvents: async () => {
        // simulate gadget generating files while receiving changes from
        // ggt causing the resulting files version to end up being
        // > expectedRemoteFilesVersion + 1
        await changeGadgetFiles({
          change: [
            {
              path: ".gadget/client.js",
              content: Buffer.from("// client").toString("base64"),
              mode: defaultFileMode,
              encoding: FileSyncEncoding.Base64,
            },
          ],
          delete: [],
        });
      },
    });

    const changes = new Changes();
    changes.set("local.txt", { type: "create" });

    await filesync.mergeChangesWithGadget(ctx, { changes });

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "gadget.txt": "// gadget",
          },
          "3": {
            ".gadget/": "",
            ".gadget/client.js": "// client",
            "gadget.txt": "// gadget",
          },
          "4": {
            ".gadget/": "",
            ".gadget/client.js": "// client",
            "gadget.txt": "// gadget",
            "local.txt": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          ".gadget/client.js": "// client",
          "gadget.txt": "// gadget",
          "local.txt": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/client.js": "// client",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"4\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"4\\"}",
          "gadget.txt": "// gadget",
          "local.txt": "// local",
        },
      }
    `);
  });
});

describe("FileSync.sync", () => {
  let appDir: string;

  beforeEach(() => {
    appDir = testDirPath("local");
    loginTestUser();
    nockTestApps();
  });

  it("does nothing if there aren't any changes", async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: { "foo.js": "// foo" },
      localFiles: { "foo.js": "// foo" },
      gadgetFiles: { "foo.js": "// foo" },
    });

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            "foo.js": "// foo",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "foo.js": "// foo",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"1\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"1\\"}",
          "foo.js": "// foo",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("does nothing if only ignored files have changed", async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {
        ".ignore": "foo.js",
        "foo.js": "// foo",
      },
      localFiles: {
        ".ignore": "foo.js",
        "foo.js": "// foo (local)",
      },
      gadgetFiles: {
        ".ignore": "foo.js",
        "foo.js": "// foo (gadget)",
      },
    });

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            ".ignore": "foo.js",
            "foo.js": "// foo",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          ".ignore": "foo.js",
          "foo.js": "// foo (gadget)",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"1\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"1\\"}",
          ".ignore": "foo.js",
          "foo.js": "// foo (local)",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("automatically merges changes if none are conflicting", async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// foo",
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "foo.js": "// foo",
        "gadget-file.js": "// gadget",
      },
    });

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            "foo.js": "// foo",
          },
          "2": {
            ".gadget/": "",
            "foo.js": "// foo",
            "gadget-file.js": "// gadget",
          },
          "3": {
            ".gadget/": "",
            "foo.js": "// foo",
            "gadget-file.js": "// gadget",
            "local-file.js": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "foo.js": "// foo",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
          "foo.js": "// foo",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`exits the process when "${ConflictPreference.CANCEL}" is chosen`, async () => {
    const { ctx, filesync, expectDirs } = await makeSyncScenario({
      filesVersion1Files: { "foo.js": "foo" },
      localFiles: { "foo.js": "foo (local)" },
      gadgetFiles: { "foo.js": "foo (gadget)" },
    });

    mockOnce(select, () => ConflictPreference.CANCEL);

    await expectProcessExit(() => filesync.sync(ctx));

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            "foo.js": "foo",
          },
          "2": {
            ".gadget/": "",
            "foo.js": "foo (gadget)",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "foo.js": "foo (gadget)",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"1\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"1\\"}",
          "foo.js": "foo (local)",
        },
      }
    `);
  });

  it(`uses local conflicting changes when "${ConflictPreference.LOCAL}" is chosen`, async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// foo (local)",
      },
      gadgetFiles: {
        "foo.js": "// foo (gadget)",
      },
    });

    mockOnce(select, () => ConflictPreference.LOCAL);

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            "foo.js": "// foo",
          },
          "2": {
            ".gadget/": "",
            "foo.js": "// foo (gadget)",
          },
          "3": {
            ".gadget/": "",
            "foo.js": "// foo (local)",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "foo.js": "// foo (local)",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
          "foo.js": "// foo (local)",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses local conflicting changes when "${ConflictPreference.LOCAL}" is passed as an argument`, async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      ctx: makeContext({ parse: DevArgs, argv: ["dev", appDir, "--app", testApp.slug, "--prefer=local"] }),
      filesVersion1Files: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// foo (local)",
      },
      gadgetFiles: {
        "foo.js": "// foo (gadget)",
      },
    });

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            "foo.js": "// foo",
          },
          "2": {
            ".gadget/": "",
            "foo.js": "// foo (gadget)",
          },
          "3": {
            ".gadget/": "",
            "foo.js": "// foo (local)",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "foo.js": "// foo (local)",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
          "foo.js": "// foo (local)",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses local conflicting changes and merges non-conflicting gadget changes when "${ConflictPreference.LOCAL}" is chosen`, async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// foo (local)",
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "foo.js": "// foo (gadget)",
        "gadget-file.js": "// gadget",
      },
    });

    mockOnce(select, () => ConflictPreference.LOCAL);

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            "foo.js": "// foo",
          },
          "2": {
            ".gadget/": "",
            "foo.js": "// foo (gadget)",
            "gadget-file.js": "// gadget",
          },
          "3": {
            ".gadget/": "",
            "foo.js": "// foo (local)",
            "gadget-file.js": "// gadget",
            "local-file.js": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "foo.js": "// foo (local)",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
          "foo.js": "// foo (local)",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses local conflicting changes and merges non-conflicting gadget changes when "${ConflictPreference.LOCAL}" is passed as an argument`, async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      ctx: makeContext({ parse: DevArgs, argv: ["dev", appDir, "--app", testApp.slug, "--prefer=local"] }),
      filesVersion1Files: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// foo (local)",
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "foo.js": "// foo (gadget)",
        "gadget-file.js": "// gadget",
      },
    });

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            "foo.js": "// foo",
          },
          "2": {
            ".gadget/": "",
            "foo.js": "// foo (gadget)",
            "gadget-file.js": "// gadget",
          },
          "3": {
            ".gadget/": "",
            "foo.js": "// foo (local)",
            "gadget-file.js": "// gadget",
            "local-file.js": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "foo.js": "// foo (local)",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
          "foo.js": "// foo (local)",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses gadget's conflicting changes when "${ConflictPreference.GADGET}" is chosen`, async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// foo (local)",
      },
      gadgetFiles: {
        "foo.js": "// foo (gadget)",
      },
    });

    mockOnce(select, () => ConflictPreference.GADGET);

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            "foo.js": "// foo",
          },
          "2": {
            ".gadget/": "",
            "foo.js": "// foo (gadget)",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "foo.js": "// foo (gadget)",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"2\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\"}",
          "foo.js": "// foo (gadget)",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses gadget's conflicting changes when "${ConflictPreference.GADGET}" is passed as an argument`, async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      ctx: makeContext({ parse: DevArgs, argv: ["dev", appDir, "--app", testApp.slug, "--prefer=gadget"] }),
      filesVersion1Files: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// foo (local)",
      },
      gadgetFiles: {
        "foo.js": "// foo (gadget)",
      },
    });

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            "foo.js": "// foo",
          },
          "2": {
            ".gadget/": "",
            "foo.js": "// foo (gadget)",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "foo.js": "// foo (gadget)",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"2\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\"}",
          "foo.js": "// foo (gadget)",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses gadget's conflicting changes and merges non-conflicting local changes when "${ConflictPreference.GADGET}" is chosen`, async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// foo (local)",
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "foo.js": "// foo (gadget)",
        "gadget-file.js": "// gadget",
      },
    });

    mockOnce(select, () => ConflictPreference.GADGET);

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            "foo.js": "// foo",
          },
          "2": {
            ".gadget/": "",
            "foo.js": "// foo (gadget)",
            "gadget-file.js": "// gadget",
          },
          "3": {
            ".gadget/": "",
            "foo.js": "// foo (gadget)",
            "gadget-file.js": "// gadget",
            "local-file.js": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "foo.js": "// foo (gadget)",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
          "foo.js": "// foo (gadget)",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses gadget's conflicting changes and merges non-conflicting local changes when "${ConflictPreference.GADGET}" is chosen`, async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// foo (local)",
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "foo.js": "// foo (gadget)",
        "gadget-file.js": "// gadget",
      },
    });

    mockOnce(select, () => ConflictPreference.GADGET);

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            "foo.js": "// foo",
          },
          "2": {
            ".gadget/": "",
            "foo.js": "// foo (gadget)",
            "gadget-file.js": "// gadget",
          },
          "3": {
            ".gadget/": "",
            "foo.js": "// foo (gadget)",
            "gadget-file.js": "// gadget",
            "local-file.js": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "foo.js": "// foo (gadget)",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
          "foo.js": "// foo (gadget)",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses gadget's conflicting changes and merges non-conflicting local changes when "${ConflictPreference.GADGET}" is passed as an argument`, async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      ctx: makeContext({ parse: DevArgs, argv: ["dev", appDir, "--app", testApp.slug, "--prefer=gadget"] }),
      filesVersion1Files: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// foo (local)",
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "foo.js": "// foo (gadget)",
        "gadget-file.js": "// gadget",
      },
    });

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            "foo.js": "// foo",
          },
          "2": {
            ".gadget/": "",
            "foo.js": "// foo (gadget)",
            "gadget-file.js": "// gadget",
          },
          "3": {
            ".gadget/": "",
            "foo.js": "// foo (gadget)",
            "gadget-file.js": "// gadget",
            "local-file.js": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "foo.js": "// foo (gadget)",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
          "foo.js": "// foo (gadget)",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("automatically uses gadget's conflicting changes if the conflicts are in the .gadget directory", async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {
        ".gadget/client.js": "// client",
      },
      localFiles: {
        ".gadget/client.js": "// client (local)",
      },
      gadgetFiles: {
        ".gadget/client.js": "// client (gadget)",
      },
    });

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            ".gadget/client.js": "// client",
          },
          "2": {
            ".gadget/": "",
            ".gadget/client.js": "// client (gadget)",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          ".gadget/client.js": "// client (gadget)",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/client.js": "// client (gadget)",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"2\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\"}",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`automatically uses gadget's conflicting changes in the .gadget directory even if "${ConflictPreference.LOCAL}" is chosen`, async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {
        ".gadget/client.js": "// client",
        "foo.js": "// foo",
      },
      localFiles: {
        ".gadget/client.js": "// client (local)",
        "foo.js": "// foo (local)",
      },
      gadgetFiles: {
        ".gadget/client.js": "// client (gadget)",
        "foo.js": "// foo (gadget)",
      },
    });

    mockOnce(select, () => ConflictPreference.LOCAL);

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            ".gadget/client.js": "// client",
            "foo.js": "// foo",
          },
          "2": {
            ".gadget/": "",
            ".gadget/client.js": "// client (gadget)",
            "foo.js": "// foo (gadget)",
          },
          "3": {
            ".gadget/": "",
            ".gadget/client.js": "// client (gadget)",
            "foo.js": "// foo (local)",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          ".gadget/client.js": "// client (gadget)",
          "foo.js": "// foo (local)",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/client.js": "// client (gadget)",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
          "foo.js": "// foo (local)",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("fetches .gadget/ files when the local filesystem doesn't have them", async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {
        ".gadget/client.js": "// client",
      },
      localFiles: {},
      gadgetFiles: {
        ".gadget/client.js": "// client",
      },
    });

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            ".gadget/client.js": "// client",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          ".gadget/client.js": "// client",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/client.js": "// client",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"1\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"1\\"}",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("merges files when .gadget/sync.json doesn't exist and --allow-unknown-directory is passed", async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      ctx: makeContext({
        parse: DevArgs,
        argv: ["dev", appDir, `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`, "--allow-unknown-directory"],
      }),
      filesVersion1Files: {
        ".gadget/client.js": "// client",
        ".gadget/server.js": "// server",
        "gadget-file.js": "// gadget",
      },
      localFiles: {
        ".gadget/sync.json": "{}", // simulate .gadget/sync.json not existing
        "local-file.js": "// local",
      },
      gadgetFiles: {
        ".gadget/client.js": "// client",
        ".gadget/server.js": "// server",
        "gadget-file.js": "// gadget",
      },
    });

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            ".gadget/client.js": "// client",
            ".gadget/server.js": "// server",
            "gadget-file.js": "// gadget",
          },
          "2": {
            ".gadget/": "",
            ".gadget/client.js": "// client",
            ".gadget/server.js": "// server",
            "gadget-file.js": "// gadget",
            "local-file.js": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          ".gadget/client.js": "// client",
          ".gadget/server.js": "// server",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/client.js": "// client",
          ".gadget/server.js": "// server",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"2\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\"}",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it('retries when it receives "Files version mismatch"', async () => {
    const scope = nockEditResponse({
      operation: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: { errors: [new GraphQLError("Files version mismatch")] },
      expectVariables: expect.anything(),
      times: 9, // 1 less than the max attempts
      statusCode: 500,
    });

    const { ctx, filesync, expectDirs } = await makeSyncScenario({
      localFiles: { "local.txt": "// local" },
      gadgetFiles: { "gadget.txt": "// gadget" },
    });

    const changes = new Changes();
    changes.set("local.txt", { type: "create" });

    await filesync.mergeChangesWithGadget(ctx, { changes });

    expect(scope.isDone()).toBe(true);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "gadget.txt": "// gadget",
          },
          "3": {
            ".gadget/": "",
            "gadget.txt": "// gadget",
            "local.txt": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "gadget.txt": "// gadget",
          "local.txt": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
          "gadget.txt": "// gadget",
          "local.txt": "// local",
        },
      }
    `);
  });

  it(`throws ${TooManySyncAttemptsError.name} if the number of sync attempts exceeds the maximum`, async () => {
    const { ctx, filesync, localDir } = await makeSyncScenario({
      localFiles: { "local.txt": "// local" },
      gadgetFiles: { "gadget.txt": "// gadget" },
      afterPublishFileSyncEvents: async () => {
        // simulate the user constantly changing files while syncing
        const uuid = randomUUID();
        await writeDir(localDir.path, {
          [`${uuid}.txt`]: uuid,
        });
      },
    });

    const changes = new Changes();
    changes.set("local.txt", { type: "create" });

    await expect(filesync.sync(ctx)).rejects.toThrow(TooManySyncAttemptsError);
  });

  it(`does not throw ${TooManySyncAttemptsError.name} if it succeeds on the last attempt`, async () => {
    const maxAttempts = 3;
    let attempt = 0;

    const { ctx, filesync, changeGadgetFiles } = await makeSyncScenario({
      localFiles: { "local.txt": "// local" },
      gadgetFiles: { "gadget.txt": "// gadget" },
      afterPublishFileSyncEvents: async () => {
        if (maxAttempts === ++attempt) {
          return;
        }

        // simulate gadget constantly changing files in the background
        await changeGadgetFiles({
          change: [
            {
              path: "gadget.txt",
              content: Buffer.from(randomUUID()).toString("base64"),
              mode: defaultFileMode,
              encoding: FileSyncEncoding.Base64,
            },
          ],
          delete: [],
        });
      },
    });

    const changes = new Changes();
    changes.set("local.txt", { type: "create" });

    await expect(filesync.sync(ctx, { maxAttempts })).resolves.not.toThrow();
  });

  it("bumps the correct environment filesVersion when multi-environment is enabled", async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      ctx: makeContext({
        parse: DevArgs,
        argv: ["dev", appDir, `--app=${testApp.slug}`, `--env=${testApp.environments[2]!.name}`],
      }),
      filesVersion1Files: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// foo",
        "local-file.js": "// local",
        ".gadget/sync.json": JSON.stringify({
          application: testApp.slug,
          environment: testApp.environments[0]!.name,
          environments: {
            [testApp.environments[0]!.name]: {
              filesVersion: "1",
            },
          },
        }),
      },
      gadgetFiles: {
        "foo.js": "// foo",
        "gadget-file.js": "// gadget",
      },
    });

    await filesync.sync(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            "foo.js": "// foo",
          },
          "2": {
            ".gadget/": "",
            "foo.js": "// foo",
            "gadget-file.js": "// gadget",
          },
          "3": {
            ".gadget/": "",
            "foo.js": "// foo",
            "gadget-file.js": "// gadget",
            "local-file.js": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "foo.js": "// foo",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"cool-environment-development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"1\\"},\\"cool-environment-development\\":{\\"filesVersion\\":\\"3\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
          "foo.js": "// foo",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });
});

describe("FileSync.push", () => {
  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  it("automatically sends local changes to gadget when gadget hasn't made any changes", async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      ctx: makeContext({ parse: PushArgs, argv: ["push", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`] }),
      localFiles: {
        "local-file.js": "// local",
      },
    });

    await filesync.push(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "local-file.js": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "local-file.js": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"2\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\"}",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("discards gadget changes and sends local changes to gadget after confirmation", async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      ctx: makeContext({ parse: PushArgs, argv: ["push", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`] }),
      filesVersion1Files: {},
      localFiles: {
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "gadget-file.js": "// gadget",
      },
    });

    mockOnce(confirm, noop);

    await filesync.push(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "gadget-file.js": "// gadget",
          },
          "3": {
            ".gadget/": "",
            "local-file.js": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "local-file.js": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();

    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("discards gadget changes and sends local changes to gadget if --force is passed", async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      ctx: makeContext({ parse: PushArgs, argv: ["push", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`, "--force"] }),
      filesVersion1Files: {},
      localFiles: {
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "gadget-file.js": "// gadget",
      },
    });

    await filesync.push(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "gadget-file.js": "// gadget",
          },
          "3": {
            ".gadget/": "",
            "local-file.js": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "local-file.js": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("discards gadget changes and sends local changes to gadget if --force is passed, except for .gadget/ files", async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      ctx: makeContext({ parse: PushArgs, argv: ["push", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`, "--force"] }),
      filesVersion1Files: {
        ".gadget/client.js": "// client",
      },
      localFiles: {
        ".gadget/client.js": "// client",
        "local-file.js": "// local",
      },
      gadgetFiles: {
        ".gadget/client.js": "// client v2",
        "gadget-file.js": "// gadget",
      },
    });

    await filesync.push(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            ".gadget/client.js": "// client",
          },
          "2": {
            ".gadget/": "",
            ".gadget/client.js": "// client v2",
            "gadget-file.js": "// gadget",
          },
          "3": {
            ".gadget/": "",
            ".gadget/client.js": "// client v2",
            "local-file.js": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          ".gadget/client.js": "// client v2",
          "local-file.js": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/client.js": "// client",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"3\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
          "local-file.js": "// local",
        },
      }
    `);

    await expect(expectLocalAndGadgetHashesMatch()).rejects.toThrowError();
  });
});

describe("FileSync.pull", () => {
  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  it("receives gadget's changes", async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      ctx: makeContext({ parse: PullArgs, argv: ["pull", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`] }),
      filesVersion1Files: {},
      localFiles: {},
      gadgetFiles: {
        "gadget-file.js": "// gadget",
      },
    });

    await filesync.pull(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "gadget-file.js": "// gadget",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "gadget-file.js": "// gadget",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"2\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\"}",
          "gadget-file.js": "// gadget",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("receives gadget's changes and discards local changes after confirmation", async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      ctx: makeContext({ parse: PullArgs, argv: ["pull", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`] }),
      filesVersion1Files: {},
      localFiles: {
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "gadget-file.js": "// gadget",
      },
    });

    mockOnce(confirm, noop);

    await filesync.pull(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "gadget-file.js": "// gadget",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "gadget-file.js": "// gadget",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/backup/": "",
          ".gadget/backup/local-file.js": "// local",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"2\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\"}",
          "gadget-file.js": "// gadget",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();

    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("receives gadget's changes and discards local changes if --force is passed", async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      ctx: makeContext({ parse: PullArgs, argv: ["pull", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`, "--force"] }),
      filesVersion1Files: {},
      localFiles: {
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "gadget-file.js": "// gadget",
      },
    });

    await filesync.pull(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "gadget-file.js": "// gadget",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "gadget-file.js": "// gadget",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/backup/": "",
          ".gadget/backup/local-file.js": "// local",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"2\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\"}",
          "gadget-file.js": "// gadget",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("discards local .gadget/ changes without confirmation", async () => {
    const { ctx, filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      ctx: makeContext({ parse: PullArgs, argv: ["pull", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`] }),
      filesVersion1Files: {},
      localFiles: {
        ".gadget/local.js": "// .gadget/local",
      },
      gadgetFiles: {
        "gadget-file.js": "// gadget",
      },
    });

    await filesync.pull(ctx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "gadget-file.js": "// gadget",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "gadget-file.js": "// gadget",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/backup/": "",
          ".gadget/backup/.gadget/": "",
          ".gadget/backup/.gadget/local.js": "// .gadget/local",
          ".gadget/sync.json": "{\\"application\\":\\"test\\",\\"environment\\":\\"development\\",\\"environments\\":{\\"development\\":{\\"filesVersion\\":\\"2\\"}},\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\"}",
          "gadget-file.js": "// gadget",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });
});

// TODO: move to errors.spec.ts
describe("isFilesVersionMismatchError", () => {
  it('returns true given an object with a message that starts with "Files version mismatch"', () => {
    expect(isFilesVersionMismatchError({ message: "Files version mismatch" })).toBe(true);
    expect(isFilesVersionMismatchError({ message: "Files version mismatch, expected 1 but got 2" })).toBe(true);
  });

  it("returns true given GraphQLErrors", () => {
    expect(isFilesVersionMismatchError([{ message: "Files version mismatch" }])).toBe(true);
  });

  it("returns true given a GraphQLResult", () => {
    expect(isFilesVersionMismatchError({ errors: [{ message: "Files version mismatch" }] })).toBe(true);
  });

  it("returns true given an EditGraphQLError", () => {
    const query = "query { foo }" as GraphQLQuery;
    expect(isFilesVersionMismatchError(new GadgetError(query, [{ message: "Files version mismatch" }]))).toBe(true);
  });

  it("returns false given an object with a message that does not start with 'Files version mismatch'", () => {
    expect(isFilesVersionMismatchError({ message: "Something else" })).toBe(false);
  });
});
