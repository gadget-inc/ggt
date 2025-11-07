import { execa } from "execa";
import fs from "fs-extra";
import { GraphQLError } from "graphql";
import nock from "nock";
import { randomUUID } from "node:crypto";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import { FileSyncEncoding } from "../../../src/__generated__/graphql.js";
import { args as DevArgs } from "../../../src/commands/dev.js";
import { PUBLISH_FILE_SYNC_EVENTS_MUTATION } from "../../../src/services/app/edit/operation.js";
import { Changes } from "../../../src/services/filesync/changes.js";
import { supportsPermissions, type Directory } from "../../../src/services/filesync/directory.js";
import { TooManyMergeAttemptsError, TooManyPushAttemptsError, isFilesVersionMismatchError } from "../../../src/services/filesync/error.js";
import { FileSync, MAX_PUSH_CONTENT_LENGTH } from "../../../src/services/filesync/filesync.js";
import { MergeConflictPreference as ConflictPreference } from "../../../src/services/filesync/strategy.js";
import { SyncJson, loadSyncJsonDirectory } from "../../../src/services/filesync/sync-json.js";
import { confirm } from "../../../src/services/output/confirm.js";
import { EdgeCaseError } from "../../../src/services/output/report.js";
import { PromiseSignal } from "../../../src/services/util/promise.js";
import { nockTestApps, testApp } from "../../__support__/app.js";
import { makeArgs } from "../../__support__/arg.js";
import { testCtx } from "../../__support__/context.js";
import { expectError } from "../../__support__/error.js";
import { expectDir, writeDir } from "../../__support__/files.js";
import {
  defaultFileMode,
  expectPublishVariables,
  expectSyncJson,
  makeFile,
  makeSyncScenario,
  type FileSyncScenarioOptions,
} from "../../__support__/filesync.js";
import { nockEditResponse } from "../../__support__/graphql.js";
import { mock, mockConfirmOnce, mockOnce, mockSelectOnce } from "../../__support__/mock.js";
import { expectStdout } from "../../__support__/output.js";
import { testDirPath } from "../../__support__/paths.js";
import { expectProcessExit } from "../../__support__/process.js";
import { mockSystemTime } from "../../__support__/time.js";
import { loginTestUser } from "../../__support__/user.js";

describe("FileSync._writeToLocalFilesystem", () => {
  // let testCtx: Context<SyncJsonArgs>;
  let localDir: Directory;
  let syncJson: SyncJson;
  let filesync: FileSync;

  let writeToLocalFilesystem: typeof FileSync.prototype.writeToLocalFilesystem;

  beforeEach(async () => {
    loginTestUser();
    nockTestApps();

    localDir = await loadSyncJsonDirectory(testDirPath("local"));
    syncJson = await SyncJson.loadOrInit(testCtx, {
      command: "dev",
      args: makeArgs(DevArgs, "dev", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`),
      directory: localDir,
    });
    filesync = new FileSync(syncJson);

    writeToLocalFilesystem = filesync.writeToLocalFilesystem.bind(filesync);
  });

  it("writes files", async () => {
    await writeToLocalFilesystem(testCtx, {
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
    await writeToLocalFilesystem(testCtx, {
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

  it("cleans up empty directories 1", async () => {
    await writeToLocalFilesystem(testCtx, {
      filesVersion: 1n,
      files: [makeFile({ path: "some/deeply/nested/directory/file.txt" })],
      delete: [],
    });

    await expectDir(localDir, {
      ".gadget/": "",
      ".gadget/sync.json": expectSyncJson(filesync),
      "some/": "",
      "some/deeply/": "",
      "some/deeply/nested/": "",
      "some/deeply/nested/directory/": "",
      "some/deeply/nested/directory/file.txt": "",
    });

    expect(filesync.syncJson.filesVersion).toBe(1n);

    // simulate someone deleting "some/deeply/nested/" in the editor
    await writeToLocalFilesystem(testCtx, {
      filesVersion: 2n,
      files: [makeFile({ path: "some/deeply/" })],
      delete: ["some/deeply/nested/directory/file.txt"],
    });

    await expectDir(localDir, {
      ".gadget/": "",
      ".gadget/sync.json": expectSyncJson(filesync),
      "some/": "",
      "some/deeply/": "",
    });

    expect(filesync.syncJson.filesVersion).toBe(2n);
  });

  it("cleans up empty directories 2", async () => {
    await writeToLocalFilesystem(testCtx, {
      filesVersion: 1n,
      files: [
        makeFile({ path: "api/models/foo/actions/create.js" }),
        makeFile({ path: "api/models/foo/actions/delete.js" }),
        makeFile({ path: "api/models/foo/actions/update.js" }),
        makeFile({ path: "api/models/foo/schema.gadget.ts" }),
      ],
      delete: [],
    });

    await expectDir(localDir, {
      ".gadget/": "",
      ".gadget/sync.json": expectSyncJson(filesync),
      "api/": "",
      "api/models/": "",
      "api/models/foo/": "",
      "api/models/foo/actions/": "",
      "api/models/foo/actions/create.js": "",
      "api/models/foo/actions/delete.js": "",
      "api/models/foo/actions/update.js": "",
      "api/models/foo/schema.gadget.ts": "",
    });

    expect(filesync.syncJson.filesVersion).toBe(1n);

    // simulate someone renaming "api/models/foo" -> "api/models/bar" in the editor
    await writeToLocalFilesystem(testCtx, {
      filesVersion: 2n,
      files: [
        makeFile({ path: "api/models/bar/actions/create.js" }),
        makeFile({ path: "api/models/bar/actions/delete.js" }),
        makeFile({ path: "api/models/bar/actions/update.js" }),
        makeFile({ path: "api/models/bar/schema.gadget.ts" }),
      ],
      delete: [
        "api/models/foo/actions/create.js",
        "api/models/foo/actions/delete.js",
        "api/models/foo/actions/update.js",
        "api/models/foo/schema.gadget.ts",
      ],
    });

    await expectDir(localDir, {
      ".gadget/": "",
      ".gadget/sync.json": expectSyncJson(filesync),
      "api/": "",
      "api/models/": "",
      "api/models/bar/": "",
      "api/models/bar/actions/": "",
      "api/models/bar/actions/create.js": "",
      "api/models/bar/actions/delete.js": "",
      "api/models/bar/actions/update.js": "",
      "api/models/bar/schema.gadget.ts": "",
    });

    expect(filesync.syncJson.filesVersion).toBe(2n);
  });

  it("cleans up empty directories 3", async () => {
    await writeToLocalFilesystem(testCtx, {
      filesVersion: 1n,
      files: [makeFile({ path: "some/nested/file.txt" })],
      delete: [],
    });

    await expectDir(localDir, {
      ".gadget/": "",
      ".gadget/sync.json": expectSyncJson(filesync),
      "some/": "",
      "some/nested/": "",
      "some/nested/file.txt": "",
    });

    expect(filesync.syncJson.filesVersion).toBe(1n);

    // simulate someone deleting "some/" in the editor
    await writeToLocalFilesystem(testCtx, {
      filesVersion: 2n,
      files: [],
      delete: ["some/nested/file.txt"],
    });

    await expectDir(localDir, {
      ".gadget/": "",
      ".gadget/sync.json": expectSyncJson(filesync),
    });

    expect(filesync.syncJson.filesVersion).toBe(2n);
  });

  it("deletes files", async () => {
    await writeDir(localDir, {
      "file.js": "foo",
      "some/deeply/nested/file.js": "bar",
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

    await writeToLocalFilesystem(testCtx, {
      filesVersion: 1n,
      files: [makeFile({ path: "some/deeply/nested/" })],
      delete: ["file.js", "some/deeply/nested/file.js"],
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

  it("updates `state.filesVersion` even if nothing changed", async () => {
    expect(filesync.syncJson.filesVersion).toBe(0n);

    await writeToLocalFilesystem(testCtx, {
      filesVersion: 1n,
      files: [],
      delete: [],
    });

    expect(filesync.syncJson.filesVersion).toBe(1n);
  });

  it("does not throw ENOENT errors when deleting files", async () => {
    await writeToLocalFilesystem(testCtx, {
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
    await writeToLocalFilesystem(testCtx, {
      filesVersion: 1n,
      files: [makeFile({ path: "foo/baz.js", content: "// baz.js" })],
      delete: ["foo/"],
    });

    await expectDir(localDir, {
      ".gadget/": "",
      ".gadget/sync.json": expectSyncJson(filesync),
      "foo/": "", // the directory should still exist because a file was added to it
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

    await writeToLocalFilesystem(testCtx, {
      filesVersion: 1n,
      files: [makeFile({ path: ".ignore", content: "" })],
      delete: [],
    });

    expect(filesync.syncJson.directory.ignores("file2.js")).toBe(false);
  });

  it("ensures the filesVersion is greater than or equal to the current filesVersion", async () => {
    expect(filesync.syncJson.filesVersion).toBe(0n);

    await writeToLocalFilesystem(testCtx, {
      filesVersion: 1n,
      files: [],
      delete: [],
    });

    expect(filesync.syncJson.filesVersion).toBe(1n);

    await writeToLocalFilesystem(testCtx, {
      filesVersion: 1n,
      files: [],
      delete: [],
    });

    expect(filesync.syncJson.filesVersion).toBe(1n);

    await expect(() =>
      writeToLocalFilesystem(testCtx, {
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

    await writeToLocalFilesystem(testCtx, {
      filesVersion: 1n,
      files: [makeFile({ path: "yarn.lock", content: "# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY." })],
      delete: [],
    });

    await execaCalled;

    assert(vi.isMockFunction(execa));
    expect(execa.mock.lastCall).toEqual(["yarn", ["install", "--check-files"], { cwd: localDir.path }]);
  });

  it("does not run `yarn install --check-files` when yarn.lock does not change", async () => {
    await writeToLocalFilesystem(testCtx, {
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
      writeToLocalFilesystem(testCtx, {
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

describe("FileSync._sendChangesToEnvironment", () => {
  mockSystemTime();

  let localDir: Directory;
  let syncJson: SyncJson;
  let filesync: FileSync;

  // @ts-expect-error _sendChangesToEnvironment is private
  let sendChangesToGadget: typeof FileSync.prototype._sendChangesToEnvironment;

  beforeEach(async () => {
    loginTestUser();
    nockTestApps();

    localDir = await loadSyncJsonDirectory(testDirPath("local"));
    syncJson = await SyncJson.loadOrInit(testCtx, {
      command: "dev",
      args: makeArgs(DevArgs, "dev", `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`),
      directory: localDir,
    });
    filesync = new FileSync(syncJson);

    // @ts-expect-error _sendChangesToEnvironment is private
    sendChangesToGadget = filesync._sendChangesToEnvironment.bind(filesync);
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

    await sendChangesToGadget(testCtx, { changes });

    expect(scope.isDone()).toBe(true);
  });

  it("doesn't send changed files to gadget if the changed files have been deleted", async () => {
    expect(nock.pendingMocks()).toEqual([]);

    const changes = new Changes();
    changes.set("does/not/exist.js", { type: "create" });
    changes.set("also/does/not/exist.js", { type: "update" });

    await sendChangesToGadget(testCtx, { changes });

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

    await expect(sendChangesToGadget(testCtx, { changes })).resolves.not.toThrow();

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

    const error = await expectError(() => sendChangesToGadget(testCtx, { changes }));

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

    const error = await expectError(() => sendChangesToGadget(testCtx, { changes }));

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

    await sendChangesToGadget(testCtx, { changes });

    expectStdout().toMatchSnapshot();
  });

  it(`throws ${EdgeCaseError.name} when the content length is greater than ${MAX_PUSH_CONTENT_LENGTH}`, async () => {
    await writeDir(localDir, {
      "file.txt": "a".repeat(MAX_PUSH_CONTENT_LENGTH + 1),
    });

    const changes = new Changes();
    changes.set("file.txt", { type: "create" });

    const error: EdgeCaseError = await expectError(() => sendChangesToGadget(testCtx, { changes }));
    expect(error).toBeInstanceOf(EdgeCaseError);
    expect(error.sprint()).toMatchInlineSnapshot(`
      "Your file changes are too large to push.

      Run "ggt status" to see your changes and consider
      ignoring some files or pushing in smaller batches.

      If you think this is a bug, use the link below to create an issue on GitHub.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000
      "
    `);
  });
});

describe("FileSync.mergeChangesWithEnvironment", () => {
  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  it('syncs when it receives "Files version mismatch" from Gadget', async () => {
    const { filesync, expectDirs } = await makeSyncScenario({
      localFiles: { "local.txt": "// local" },
      gadgetFiles: { "gadget.txt": "// gadget" },
    });

    const changes = new Changes();
    changes.set("local.txt", { type: "create" });

    await filesync.mergeChangesWithEnvironment(testCtx, { changes });

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
          "gadget.txt": "// gadget",
          "local.txt": "// local",
        },
      }
    `);
  });

  it('syncs when it receives "Files version mismatch" from files version greater than the expectedRemoteFilesVersion + 1', async () => {
    const { filesync, expectDirs, changeGadgetFiles } = await makeSyncScenario({
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

    await filesync.mergeChangesWithEnvironment(testCtx, { changes });

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"4"}}}",
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
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: { "foo.js": "// foo" },
      localFiles: { "foo.js": "// foo" },
      gadgetFiles: { "foo.js": "// foo" },
    });

    await filesync.merge(testCtx);

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}}}",
          "foo.js": "// foo",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("does nothing if only ignored files have changed", async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
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

    await filesync.merge(testCtx);

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}}}",
          ".ignore": "foo.js",
          "foo.js": "// foo (local)",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("automatically merges changes if none are conflicting", async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
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

    await filesync.merge(testCtx);

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
          "foo.js": "// foo",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`exits the process when "${ConflictPreference.CANCEL}" is chosen`, async () => {
    const { filesync, expectDirs } = await makeSyncScenario({
      filesVersion1Files: { "foo.js": "foo" },
      localFiles: { "foo.js": "foo (local)" },
      gadgetFiles: { "foo.js": "foo (gadget)" },
    });

    mockSelectOnce(ConflictPreference.CANCEL);

    await expectProcessExit(() => filesync.merge(testCtx));

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}}}",
          "foo.js": "foo (local)",
        },
      }
    `);
  });

  it(`uses local conflicting changes when "${ConflictPreference.LOCAL}" is chosen`, async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
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

    mockSelectOnce(ConflictPreference.LOCAL);

    await filesync.merge(testCtx);

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
          "foo.js": "// foo (local)",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses local conflicting changes when "${ConflictPreference.LOCAL}" is passed as an argument`, async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
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

    await filesync.merge(testCtx, { prefer: ConflictPreference.LOCAL });

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
          "foo.js": "// foo (local)",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses local conflicting changes and merges non-conflicting gadget changes when "${ConflictPreference.LOCAL}" is chosen`, async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
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

    mockSelectOnce(ConflictPreference.LOCAL);

    await filesync.merge(testCtx);

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
          "foo.js": "// foo (local)",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses local conflicting changes and merges non-conflicting gadget changes when "${ConflictPreference.LOCAL}" is passed as an argument`, async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
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

    await filesync.merge(testCtx, { prefer: ConflictPreference.LOCAL });

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
          "foo.js": "// foo (local)",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses gadget's conflicting changes when "${ConflictPreference.ENVIRONMENT}" is chosen`, async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
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

    mockSelectOnce(ConflictPreference.ENVIRONMENT);

    await filesync.merge(testCtx);

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
          "foo.js": "// foo (gadget)",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses gadget's conflicting changes when "${ConflictPreference.ENVIRONMENT}" is passed as an argument`, async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
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

    await filesync.merge(testCtx, { prefer: ConflictPreference.ENVIRONMENT });

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
          "foo.js": "// foo (gadget)",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses gadget's conflicting changes and merges non-conflicting local changes when "${ConflictPreference.ENVIRONMENT}" is chosen`, async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
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

    mockSelectOnce(ConflictPreference.ENVIRONMENT);

    await filesync.merge(testCtx);

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
          "foo.js": "// foo (gadget)",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses gadget's conflicting changes and merges non-conflicting local changes when "${ConflictPreference.ENVIRONMENT}" is chosen`, async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
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

    mockSelectOnce(ConflictPreference.ENVIRONMENT);

    await filesync.merge(testCtx);

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
          "foo.js": "// foo (gadget)",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses gadget's conflicting changes and merges non-conflicting local changes when "${ConflictPreference.ENVIRONMENT}" is passed as an argument`, async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
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

    await filesync.merge(testCtx, { prefer: ConflictPreference.ENVIRONMENT });

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
          "foo.js": "// foo (gadget)",
          "gadget-file.js": "// gadget",
          "local-file.js": "// local",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("automatically uses gadget's conflicting changes if the conflicts are in the .gadget directory", async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
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

    await filesync.merge(testCtx);

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`automatically uses gadget's conflicting changes in the .gadget directory even if "${ConflictPreference.LOCAL}" is chosen`, async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
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

    mockSelectOnce(ConflictPreference.LOCAL);

    await filesync.merge(testCtx);

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
          "foo.js": "// foo (local)",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("fetches .gadget/ files when the local filesystem doesn't have them", async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {
        ".gadget/client.js": "// client",
      },
      localFiles: {},
      gadgetFiles: {
        ".gadget/client.js": "// client",
      },
    });

    await filesync.merge(testCtx);

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}}}",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("fetches .gadget/ files even if they are ignored", async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {
        ".gadget/client.js": "// client",
      },
      localFiles: {
        ".ignore": ".gadget/",
      },
      gadgetFiles: {
        ".gadget/client.js": "// client",
      },
    });

    await filesync.merge(testCtx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
            ".gadget/client.js": "// client",
          },
          "2": {
            ".gadget/": "",
            ".gadget/client.js": "// client",
            ".ignore": ".gadget/",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          ".gadget/client.js": "// client",
          ".ignore": ".gadget/",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/client.js": "// client",
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
          ".ignore": ".gadget/",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("merges files when .gadget/sync.json doesn't exist and --allow-unknown-directory is passed", async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      args: makeArgs(
        DevArgs,
        "dev",
        appDir,
        `--app=${testApp.slug}`,
        `--env=${testApp.environments[0]!.name}`,
        "--allow-unknown-directory",
      ),
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

    await filesync.merge(testCtx);

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
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

    const { filesync, expectDirs } = await makeSyncScenario({
      localFiles: { "local.txt": "// local" },
      gadgetFiles: { "gadget.txt": "// gadget" },
    });

    const changes = new Changes();
    changes.set("local.txt", { type: "create" });

    await filesync.mergeChangesWithEnvironment(testCtx, { changes });

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
          "gadget.txt": "// gadget",
          "local.txt": "// local",
        },
      }
    `);
  });

  it(`throws ${TooManyMergeAttemptsError.name} if the number of sync attempts exceeds the maximum`, async () => {
    const { filesync, localDir } = await makeSyncScenario({
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

    await expect(filesync.merge(testCtx)).rejects.toThrow(TooManyMergeAttemptsError);
  });

  it(`does not throw ${TooManyMergeAttemptsError.name} if it succeeds on the last attempt`, async () => {
    const maxAttempts = 3;
    let attempt = 0;

    const { filesync, changeGadgetFiles } = await makeSyncScenario({
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

    await expect(filesync.merge(testCtx, { maxAttempts })).resolves.not.toThrow();
  });

  it("bumps the correct environment filesVersion when multi-environment is enabled", async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      args: makeArgs(DevArgs, "dev", appDir, `--app=${testApp.slug}`, `--env=${testApp.environments[2]!.name}`),
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

    await filesync.merge(testCtx);

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
          ".gadget/sync.json": "{"application":"test","environment":"cool-environment-development","environments":{"development":{"filesVersion":"1"},"cool-environment-development":{"filesVersion":"3"}}}",
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

  it("sends local changes to gadget when gadget hasn't made any changes", async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      localFiles: {
        "local-file.js": "// local",
      },
    });

    await filesync.push(testCtx, { command: "push" });

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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
            "local-file.js": "// local",
          },
        }
      `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("discards gadget changes and sends local changes to gadget", async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {},
      localFiles: {
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "gadget-file.js": "// gadget",
      },
    });

    await filesync.push(testCtx, { command: "push" });

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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
            "local-file.js": "// local",
          },
        }
      `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("discards gadget changes and sends local changes to gadget, except for .gadget/ files", async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
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

    await filesync.push(testCtx, { command: "push" });

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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
            "local-file.js": "// local",
          },
        }
      `);

    await expect(expectLocalAndGadgetHashesMatch()).rejects.toThrowError();
  });

  it('retries sending local changes to gadget when it receives "Files version mismatch" and only .gadget/ files changed', async () => {
    const { filesync, changeGadgetFiles, expectDirs } = await makeSyncScenario({
      localFiles: {
        "local-file.js": "// local",
      },
    });

    // @ts-expect-error _sendChangesToEnvironment is private
    mockOnce(filesync, "_sendChangesToEnvironment", async (_ctx, _options) => {
      // simulate gadget updating .gadget/ files while we're trying to send local changes to gadget
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

      throw new Error("Files version mismatch");
    });

    await filesync.push(testCtx, { command: "push" });

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            ".gadget/client.js": "// client",
          },
          "3": {
            ".gadget/": "",
            ".gadget/client.js": "// client",
            "local-file.js": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          ".gadget/client.js": "// client",
          "local-file.js": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
          "local-file.js": "// local",
        },
      }
    `);
  });

  it(`throws ${TooManyPushAttemptsError.name} if it exceeds the maximum number of attempts`, async () => {
    const { filesync, changeGadgetFiles } = await makeSyncScenario({
      localFiles: {
        "local-file.js": "// local",
      },
    });

    // @ts-expect-error _sendChangesToEnvironment is private
    mock(filesync, "_sendChangesToEnvironment", async (_ctx, _options) => {
      // simulate gadget constantly changing .gadget/ files while we're trying to send local changes to gadget
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

      throw new Error("Files version mismatch");
    });

    await expect(filesync.push(testCtx, { command: "push" })).rejects.toThrowError(TooManyPushAttemptsError);
  });

  it(`does not throw ${TooManyPushAttemptsError.name} if it succeeds on the last attempt`, async () => {
    const { filesync, changeGadgetFiles, expectDirs } = await makeSyncScenario({
      localFiles: {
        "local-file.js": "// local",
      },
    });

    const maxAttempts = 3;
    let attempt = 0;

    // @ts-expect-error _sendChangesToEnvironment is private
    const spy = mock(filesync, "_sendChangesToEnvironment", async (ctx, options) => {
      attempt++;
      if (attempt === maxAttempts) {
        spy.mockRestore();
        // @ts-expect-error _sendChangesToEnvironment is private
        return filesync._sendChangesToEnvironment.call(filesync, ctx, options);
      }

      // simulate gadget constantly changing .gadget/ files while we're trying to send local changes to gadget
      await changeGadgetFiles({
        change: [
          {
            path: `.gadget/client/file-${attempt}.js`,
            content: Buffer.from(`// file-${attempt}`).toString("base64"),
            mode: defaultFileMode,
            encoding: FileSyncEncoding.Base64,
          },
        ],
        delete: [],
      });

      throw new Error("Files version mismatch");
    });

    await filesync.push(testCtx, { command: "push", maxAttempts });
    expect(attempt).toBe(maxAttempts);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            ".gadget/client/": "",
            ".gadget/client/file-1.js": "// file-1",
          },
          "3": {
            ".gadget/": "",
            ".gadget/client/": "",
            ".gadget/client/file-1.js": "// file-1",
            ".gadget/client/file-2.js": "// file-2",
          },
          "4": {
            ".gadget/": "",
            ".gadget/client/": "",
            ".gadget/client/file-1.js": "// file-1",
            ".gadget/client/file-2.js": "// file-2",
            "local-file.js": "// local",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          ".gadget/client/": "",
          ".gadget/client/file-1.js": "// file-1",
          ".gadget/client/file-2.js": "// file-2",
          "local-file.js": "// local",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"4"}}}",
          "local-file.js": "// local",
        },
      }
    `);
  });

  it(`throws ${EdgeCaseError.name} when it receives "Files version mismatch" and non-.gadget/ files changed`, async () => {
    const { filesync, changeGadgetFiles, expectDirs } = await makeSyncScenario({
      localFiles: {
        "local-file.js": "// local",
      },
    });

    // @ts-expect-error _sendChangesToEnvironment is private
    mockOnce(filesync, "_sendChangesToEnvironment", async (_ctx, _options) => {
      // simulate gadget changing non-.gadget/ files while we're trying to send local changes to gadget
      await changeGadgetFiles({
        change: [
          {
            path: ".gadget/client.js",
            content: Buffer.from("// client").toString("base64"),
            mode: defaultFileMode,
            encoding: FileSyncEncoding.Base64,
          },
          {
            path: "some-file.js", // non-.gadget/ file
            content: Buffer.from("// some file").toString("base64"),
            mode: defaultFileMode,
            encoding: FileSyncEncoding.Base64,
          },
        ],
        delete: [],
      });

      throw new Error("Files version mismatch");
    });

    await expect(filesync.push(testCtx, { command: "push" })).rejects.toThrowError(EdgeCaseError);

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            ".gadget/client.js": "// client",
            "some-file.js": "// some file",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          ".gadget/client.js": "// client",
          "some-file.js": "// some file",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}}}",
          "local-file.js": "// local",
        },
      }
    `);
  });

  it(`does not throw ${EdgeCaseError.name} when it receives "Files version mismatch" and the environment files version is greater than the expected files version + 1`, async () => {
    const { filesync, changeGadgetFiles, expectDirs } = await makeSyncScenario({
      localFiles: {
        "local-file.js": "// local",
      },
      beforePublishFileSyncEvents: async () => {
        // simulate gadget changing files right before receiving changes
        // from ggt causing the resulting files version to end up being
        // > expectedRemoteFilesVersion + 1
        await changeGadgetFiles({
          change: [
            {
              path: "some-file.js",
              content: Buffer.from("// some file").toString("base64"),
              mode: defaultFileMode,
              encoding: FileSyncEncoding.Base64,
            },
          ],
          delete: [],
        });
      },
    });

    await filesync.push(testCtx, { command: "push" });

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "some-file.js": "// some file",
          },
          "3": {
            ".gadget/": "",
            "local-file.js": "// local",
            "some-file.js": "// some file",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "local-file.js": "// local",
          "some-file.js": "// some file",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}}}",
          "local-file.js": "// local",
        },
      }
    `);
  });
});

describe("FileSync.pull", () => {
  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  it("receives gadget's changes", async () => {
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.txt`);

    const { filesync, expectDirs } = await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
      },
      gadgetFiles: {
        ...files.reduce((acc, filename) => ({ ...acc, [filename]: filename }), {}),
      },
    });

    await expectDirs().resolves.toMatchInlineSnapshot(`
        {
          "filesVersionDirs": {
            "1": {
              ".gadget/": "",
            },
            "2": {
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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}}}",
          },
        }
      `);

    await filesync.pull(testCtx);

    await expectDirs().resolves.toMatchInlineSnapshot(`
        {
          "filesVersionDirs": {
            "1": {
              ".gadget/": "",
            },
            "2": {
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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
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

  it("receives gadget's changes and discards local changes after confirmation", async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {},
      localFiles: {
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "gadget-file.js": "// gadget",
      },
    });

    mockConfirmOnce();

    await filesync.pull(testCtx);

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
          "gadget-file.js": "// gadget",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();

    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("receives gadget's changes and discards local changes if --force is passed", async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {},
      localFiles: {
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "gadget-file.js": "// gadget",
      },
    });

    await filesync.pull(testCtx, { force: true });

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
          "gadget-file.js": "// gadget",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("discards local .gadget/ changes without confirmation", async () => {
    const { filesync, expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {},
      localFiles: {
        ".gadget/local.js": "// .gadget/local",
      },
      gadgetFiles: {
        "gadget-file.js": "// gadget",
      },
    });

    await filesync.pull(testCtx);

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
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
          "gadget-file.js": "// gadget",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });
});

describe("FileSync.print", () => {
  mockSystemTime();

  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const makePrintScenario = (options?: Partial<FileSyncScenarioOptions>) => {
    return makeSyncScenario({
      ...options,
      filesVersion1Files: {
        "local.txt": "local",
        "environment.txt": "environment",
        "shared.txt": "shared",
        ...options?.filesVersion1Files,
      },
      localFiles: {
        "local.txt": "local",
        "environment.txt": "environment",
        "shared.txt": "shared",
        ...options?.localFiles,
      },
      gadgetFiles: {
        "local.txt": "local",
        "environment.txt": "environment",
        "shared.txt": "shared",
        ...options?.gadgetFiles,
      },
    });
  };

  it("prints the expected output when no files have changed", async () => {
    const { filesync } = await makePrintScenario();

    await filesync.print(testCtx);

    expectStdout().toMatchInlineSnapshot(`
      "⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM
      "
    `);
  });

  it("prints the expected output when local files have changed", async () => {
    const { filesync } = await makePrintScenario({
      localFiles: {
        "local-file.txt": "local",
      },
    });

    await filesync.print(testCtx);

    expectStdout().toMatchInlineSnapshot(`
      "⠙ Calculating file changes.
      ✔ Calculated file changes. 12:00:00 AM

      Your local files have changed.
      +  local-file.txt  created

      Your environment's files have not changed.
      "
    `);
  });

  it("prints the expected output when environment files have changed", async () => {
    const { filesync } = await makePrintScenario({
      gadgetFiles: {
        "environment-file.txt": "environment",
      },
    });

    await filesync.print(testCtx);

    expectStdout().toMatchInlineSnapshot(`
      "⠙ Calculating file changes.
      ✔ Calculated file changes. 12:00:00 AM

      Your local files have not changed.

      Your environment's files have changed.
      +  environment-file.txt  created
      "
    `);
  });

  it("prints the expected output when local and environment files have changed", async () => {
    const { filesync } = await makePrintScenario({
      localFiles: {
        "local-file.txt": "local",
      },
      gadgetFiles: {
        "environment-file.txt": "environment",
      },
    });

    await filesync.print(testCtx);

    expectStdout().toMatchInlineSnapshot(`
      "⠙ Calculating file changes.
      ✔ Calculated file changes. 12:00:00 AM

      Your local files have changed.
      +  local-file.txt  created

      Your environment's files have also changed.
      +  environment-file.txt  created
      "
    `);
  });
});
