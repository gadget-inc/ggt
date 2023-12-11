import fs from "fs-extra";
import nock from "nock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { FileSyncEncoding } from "../../../src/__generated__/graphql.js";
import * as app from "../../../src/services/app/app.js";
import { PUBLISH_FILE_SYNC_EVENTS_MUTATION, REMOTE_FILES_VERSION_QUERY } from "../../../src/services/app/edit-graphql.js";
import { ArgError } from "../../../src/services/command/arg.js";
import { Changes } from "../../../src/services/filesync/changes.js";
import { supportsPermissions } from "../../../src/services/filesync/directory.js";
import { InvalidSyncFileError } from "../../../src/services/filesync/error.js";
import { Action, FileSync } from "../../../src/services/filesync/filesync.js";
import * as prompt from "../../../src/services/output/prompt.js";
import { testApp } from "../../__support__/app.js";
import { nockEditGraphQLResponse } from "../../__support__/edit-graphql.js";
import { expectError } from "../../__support__/error.js";
import { expectDir, readDir, writeDir } from "../../__support__/files.js";
import { expectSyncJson, makeFile } from "../../__support__/filesync.js";
import { prettyJSON } from "../../__support__/json.js";
import { testDirPath } from "../../__support__/paths.js";
import { expectProcessExit } from "../../__support__/process.js";
import { sleep } from "../../__support__/sleep.js";
import { loginTestUser, testUser } from "../../__support__/user.js";

let appDir: string;
let appDirPath: (...segments: string[]) => string;

beforeEach(() => {
  appDir = testDirPath("app");
  appDirPath = (...segments) => testDirPath("app", ...segments);

  vi.spyOn(app, "getApps").mockResolvedValue([
    testApp,
    { id: 2, slug: "not-test", primaryDomain: "not-test.gadget.app", hasSplitEnvironments: false, user: testUser },
  ]);
});

afterEach(() => {
  expect(nock.pendingMocks()).toEqual([]);
});

describe("FileSync.init", () => {
  it("ensures `dir` exists", async () => {
    await expect(fs.exists(appDir)).resolves.toBe(false);

    await FileSync.init({ user: testUser, dir: appDir, app: testApp.slug });

    expect(fs.existsSync(appDir)).toBe(true);
  });

  it("loads state from .gadget/sync.json", async () => {
    const state = { app: testApp.slug, filesVersion: "77", mtime: 1658153625236 };
    await fs.outputJSON(appDirPath(".gadget/sync.json"), state);

    const filesync = await FileSync.init({ user: testUser, dir: appDir, app: testApp.slug });

    // @ts-expect-error _state is private
    expect(filesync._state).toEqual(state);
  });

  it("uses default state if .gadget/sync.json does not exist and `dir` is empty", async () => {
    const filesync = await FileSync.init({ user: testUser, dir: appDir, app: testApp.slug });

    // @ts-expect-error _state is private
    expect(filesync._state).toEqual({ app: "test", filesVersion: "0", mtime: 0 });
  });

  it("throws InvalidSyncFileError if .gadget/sync.json does not exist and `dir` is not empty", async () => {
    await fs.outputFile(appDirPath("foo.js"), "foo");

    await expect(FileSync.init({ user: testUser, dir: appDir, app: testApp.slug })).rejects.toThrow(InvalidSyncFileError);
  });

  it("throws InvalidSyncFileError if .gadget/sync.json is invalid", async () => {
    // has trailing comma
    await fs.outputFile(appDirPath(".gadget/sync.json"), '{"app":"test","filesVersion":"77","mtime":1658153625236,}');

    await expect(FileSync.init({ user: testUser, dir: appDir, app: testApp.slug })).rejects.toThrow(InvalidSyncFileError);
  });

  it("does not throw InvalidSyncFileError if .gadget/sync.json is invalid and `--force` is passed", async () => {
    // has trailing comma
    await fs.outputFile(appDirPath(".gadget/sync.json"), '{"app":"test","filesVersion":"77","mtime":1658153625236,}');

    const filesync = await FileSync.init({ user: testUser, dir: appDir, app: testApp.slug, force: true });

    // @ts-expect-error _state is private
    expect(filesync._state).toEqual({ app: testApp.slug, filesVersion: "0", mtime: 0 });
  });

  it("throws ArgError if the `--app` arg is passed a slug that does not exist within the user's available apps", async () => {
    const error = await expectError(() => FileSync.init({ user: testUser, dir: appDir, app: "does-not-exist" }));

    expect(error).toBeInstanceOf(ArgError);
    expect(error.message).toMatchInlineSnapshot(`
            "Unknown application:

              does-not-exist

            Did you mean one of these?

              • not-test
              • test"
          `);
  });

  it("throws ArgError if the user doesn't have any available apps", async () => {
    vi.spyOn(app, "getApps").mockResolvedValue([]);

    const error = await expectError(() => FileSync.init({ user: testUser, dir: appDir, app: "does-not-exist" }));

    expect(error).toBeInstanceOf(ArgError);
    expect(error.message).toMatchInlineSnapshot(`
      "You (test@example.com) don't have have any Gadget applications.

      Visit https://gadget.new to create one!"
    `);
  });

  it("throws ArgError if the `--app` flag is passed a different app name than the one in .gadget/sync.json", async () => {
    await fs.outputJson(appDirPath(".gadget/sync.json"), { app: "not-test", filesVersion: "77", mtime: 1658153625236 });

    const error = await expectError(() => FileSync.init({ user: testUser, dir: appDir, app: testApp.slug }));

    expect(error).toBeInstanceOf(ArgError);
    expect(error.message).toMatch(/^You were about to sync the following app to the following directory:/);
  });

  it("does not throw ArgError if the `--app` flag is passed a different app name than the one in .gadget/sync.json and `--force` is passed", async () => {
    await fs.outputJson(appDirPath(".gadget/sync.json"), { app: "not-test", filesVersion: "77", mtime: 1658153625236 });

    const filesync = await FileSync.init({ user: testUser, dir: appDir, app: testApp.slug, force: true });

    // @ts-expect-error _state is private
    expect(filesync._state).toEqual({ app: testApp.slug, filesVersion: "0", mtime: 0 });
  });
});

describe("FileSync.writeToLocalFilesystem", () => {
  let filesync: FileSync;

  // @ts-expect-error _writeToLocalFilesystem is private
  let writeToLocalFilesystem: typeof FileSync.prototype._writeToLocalFilesystem;

  beforeEach(async () => {
    filesync = await FileSync.init({ user: testUser, dir: appDir, app: testApp.slug });

    // @ts-expect-error _writeToLocalFilesystem is private
    writeToLocalFilesystem = filesync._writeToLocalFilesystem.bind(filesync);
  });

  it("writes files", async () => {
    await writeToLocalFilesystem({
      filesVersion: 1n,
      files: [
        makeFile({ path: "file.js", content: "foo", mode: 0o644 }),
        makeFile({ path: "some/deeply/nested/file.js", content: "bar", mode: 0o755 }),
      ],
      delete: [],
    });

    await expectDir(appDir, {
      ".gadget/": "",
      ".gadget/sync.json": expectSyncJson(filesync),
      "file.js": "foo",
      "some/": "",
      "some/deeply/": "",
      "some/deeply/nested/": "",
      "some/deeply/nested/file.js": "bar",
    });

    expect(filesync.filesVersion).toBe(1n);

    if (supportsPermissions) {
      const fileStat = await fs.stat(appDirPath("file.js"));
      expect(fileStat.mode & 0o777).toBe(0o644);

      const nestedFileStat = await fs.stat(appDirPath("some/deeply/nested/file.js"));
      expect(nestedFileStat.mode & 0o777).toBe(0o755);
    }
  });

  it("writes empty directories", async () => {
    await writeToLocalFilesystem({
      filesVersion: 1n,
      files: [makeFile({ path: "some/deeply/nested/" })],
      delete: [],
    });

    await expectDir(appDir, {
      ".gadget/": "",
      ".gadget/sync.json": expectSyncJson(filesync),
      "some/": "",
      "some/deeply/": "",
      "some/deeply/nested/": "",
    });

    expect(filesync.filesVersion).toBe(1n);
  });

  it("deletes files", async () => {
    await writeDir(appDir, {
      "file.js": "foo",
      "some/deeply/nested/file.js": "bar",
    });

    await expectDir(appDir, {
      "file.js": "foo",
      "some/": "",
      "some/deeply/": "",
      "some/deeply/nested/": "",
      "some/deeply/nested/file.js": "bar",
    });

    await writeToLocalFilesystem({
      filesVersion: 1n,
      files: [],
      delete: ["file.js", "some/deeply/nested/file.js"],
    });

    await expectDir(appDir, {
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

    expect(filesync.filesVersion).toBe(1n);
  });

  it("updates `state.filesVersion` even if nothing changed", async () => {
    expect(filesync.filesVersion).toBe(0n);

    await writeToLocalFilesystem({
      filesVersion: 1n,
      files: [],
      delete: [],
    });

    expect(filesync.filesVersion).toBe(1n);
  });

  it("does not throw ENOENT errors when deleting files", async () => {
    await writeToLocalFilesystem({
      filesVersion: 1n,
      files: [],
      delete: ["does/not/exist.js"],
    });

    expect(filesync.filesVersion).toBe(1n);
  });

  it("deletes files before writing files", async () => {
    await writeDir(appDir, {
      "foo/": "",
    });

    // emit an event that both deletes a directory and changes a file in
    // that directory
    await writeToLocalFilesystem({
      filesVersion: 1n,
      files: [makeFile({ path: "foo/baz.js", content: "// baz.js" })],
      delete: ["foo/"],
    });

    await expectDir(appDir, {
      ".gadget/": "",
      ".gadget/sync.json": expectSyncJson(filesync),
      ".gadget/backup/": "",
      // the directory should have been deleted
      ".gadget/backup/foo/": "",
      // but the directory should still exist because a file was added to it
      "foo/": "",
      "foo/baz.js": "// baz.js",
    });

    expect(filesync.filesVersion).toBe(1n);
  });

  it("reloads the ignore file when it changes", async () => {
    await writeDir(appDir, {
      ".ignore": "file2.js",
      "file1.js": "one",
      "file3.js": "three",
    });

    await filesync.directory.loadIgnoreFile();

    expect(filesync.directory.ignores("file2.js")).toBe(true);

    await writeToLocalFilesystem({
      filesVersion: 1n,
      files: [makeFile({ path: ".ignore", content: "" })],
      delete: [],
    });

    expect(filesync.directory.ignores("file2.js")).toBe(false);
  });

  it("removes old backup files before moving new files into place", async () => {
    // create a file named `foo.js`
    await fs.outputFile(filesync.directory.absolute("foo.js"), "// foo");

    // create a directory named `.gadget/backup/foo.js`
    await fs.mkdirp(filesync.directory.absolute(".gadget/backup/foo.js"));

    // tell filesync to delete foo.js, which should move it to
    // .gadget/backup/foo.js if the backup file is not removed first,
    // this will fail with "Error: Cannot overwrite directory"
    await writeToLocalFilesystem({ filesVersion: 1n, files: [], delete: ["foo.js"] });

    await expectDir(appDir, {
      ".gadget/": "",
      ".gadget/sync.json": expectSyncJson(filesync),
      ".gadget/backup/": "",
      ".gadget/backup/foo.js": "// foo",
    });
  });

  it("ensures the filesVersion is greater than or equal to the current filesVersion", async () => {
    expect(filesync.filesVersion).toBe(0n);

    await writeToLocalFilesystem({
      filesVersion: 1n,
      files: [],
      delete: [],
    });

    expect(filesync.filesVersion).toBe(1n);

    await writeToLocalFilesystem({
      filesVersion: 1n,
      files: [],
      delete: [],
    });

    expect(filesync.filesVersion).toBe(1n);

    await expect(() =>
      writeToLocalFilesystem({
        filesVersion: 0n,
        files: [],
        delete: [],
      }),
    ).rejects.toThrow("filesVersion must be greater than or equal to current filesVersion");
  });
});

describe("FileSync.sendChangesToGadget", () => {
  let filesync: FileSync;

  beforeEach(async () => {
    filesync = await FileSync.init({ user: testUser, dir: appDir, app: testApp.slug });
  });

  it("doesn't send changed files to gadget if the changed files have been deleted", async () => {
    expect(nock.pendingMocks()).toEqual([]);

    const changes = new Changes();
    changes.set("does/not/exist.js", { type: "create" });
    changes.set("also/does/not/exist.js", { type: "update" });

    await filesync.sendChangesToGadget({ changes });

    expect(nock.pendingMocks()).toEqual([]);
  });
});

describe("FileSync.sync", () => {
  beforeEach(() => {
    loginTestUser();
  });

  afterEach(() => {
    expect(nock.pendingMocks()).toEqual([]);
  });

  it("asks how to proceed if only local files changed", async () => {
    vi.spyOn(prompt, "select").mockResolvedValue(Action.CANCEL);
    void nockEditGraphQLResponse({ query: REMOTE_FILES_VERSION_QUERY, result: { data: { remoteFilesVersion: "1" } } });
    await writeDir(appDir, {
      ".gadget/sync.json": prettyJSON({ app: "test", filesVersion: "1", mtime: Date.now() - 1000 }),
      "foo.js": "foo",
    });

    const filesync = await FileSync.init({ user: testUser, dir: appDir, app: testApp.slug });
    await expectProcessExit(() => filesync.sync());

    expect(prompt.select.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        {
          "choices": [
            "Cancel (Ctrl+C)",
            "Merge local files with remote ones",
            "Reset local files to remote ones",
          ],
          "message": "How would you like to proceed?",
        }
      `);
  });

  it("asks how to proceed if both local and remote files changed", async () => {
    vi.spyOn(prompt, "select").mockResolvedValue(Action.CANCEL);
    void nockEditGraphQLResponse({ query: REMOTE_FILES_VERSION_QUERY, result: { data: { remoteFilesVersion: "2" } } });
    await writeDir(appDir, {
      ".gadget/sync.json": prettyJSON({ app: "test", filesVersion: "1", mtime: Date.now() - 1000 }),
      "foo.js": "foo",
      "bar.js": "bar",
    });

    const filesync = await FileSync.init({ user: testUser, dir: appDir, app: testApp.slug });
    await expectProcessExit(() => filesync.sync());

    expect(prompt.select.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        {
          "choices": [
            "Cancel (Ctrl+C)",
            "Merge local files with remote ones",
            "Reset local files to remote ones",
          ],
          "message": "Remote files have also changed. How would you like to proceed?",
        }
      `);
  });

  it("does not ask how to proceed if only ignored files changed", async () => {
    vi.spyOn(prompt, "select");
    void nockEditGraphQLResponse({ query: REMOTE_FILES_VERSION_QUERY, result: { data: { remoteFilesVersion: "1" } } });
    await writeDir(appDir, {
      ".ignore": "bar.js",
      "foo.js": "foo",
    });

    const stat = await fs.stat(appDirPath("foo.js"));
    await fs.outputJson(appDirPath(".gadget/sync.json"), { app: "test", filesVersion: "1", mtime: stat.mtime.getTime() });

    // wait a bit so the mtime is different
    await sleep("10ms");

    // write an ignored file
    await fs.writeFile(appDirPath("bar.js"), "bar");

    const filesync = await FileSync.init({ user: testUser, dir: appDir, app: testApp.slug });
    await filesync.sync();

    expect(prompt.select).not.toHaveBeenCalled();
  });

  it("does not ask how to proceed if only remote files changed", async () => {
    vi.spyOn(prompt, "select");
    void nockEditGraphQLResponse({ query: REMOTE_FILES_VERSION_QUERY, result: { data: { remoteFilesVersion: "1" } } });
    await writeDir(appDir, {
      "foo.js": "foo",
    });

    const stat = fs.statSync(appDirPath("foo.js"));
    fs.outputJSONSync(appDirPath(".gadget/sync.json"), { app: "test", filesVersion: "1", mtime: stat.mtime.getTime() });

    const filesync = await FileSync.init({ user: testUser, dir: appDir, app: testApp.slug });
    await filesync.sync();

    expect(prompt.select).not.toHaveBeenCalled();
  });

  it("does not ask how to proceed if neither local nor remote files changed", async () => {
    vi.spyOn(prompt, "select");
    void nockEditGraphQLResponse({ query: REMOTE_FILES_VERSION_QUERY, result: { data: { remoteFilesVersion: "1" } } });
    await writeDir(appDir, {
      "foo.js": "foo",
    });

    const stat = fs.statSync(appDirPath("foo.js"));
    fs.outputJsonSync(appDirPath(".gadget/sync.json"), { app: "test", filesVersion: "1", mtime: stat.mtime.getTime() });

    const filesync = await FileSync.init({ user: testUser, dir: appDir, app: testApp.slug });
    await filesync.sync();

    expect(prompt.select).not.toHaveBeenCalled();
  });

  it("publishes changed events when told to merge", async () => {
    vi.spyOn(prompt, "select").mockResolvedValue(Action.MERGE);
    void nockEditGraphQLResponse({ query: REMOTE_FILES_VERSION_QUERY, result: { data: { remoteFilesVersion: "1" } } });
    const published = nockEditGraphQLResponse({
      query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      result: { data: { publishFileSyncEvents: { remoteFilesVersion: "2" } } },
      expectVariables: z.strictObject({
        input: z.strictObject({
          expectedRemoteFilesVersion: z.literal("1"),
          changed: z
            .array(z.strictObject({ path: z.string(), content: z.string(), mode: z.number(), encoding: z.nativeEnum(FileSyncEncoding) }))
            .length(2),
          deleted: z.array(z.string()).length(0),
        }),
      }),
    });

    await writeDir(appDir, {
      "foo.js": "foo",
      "bar.js": "bar",
    });

    const stat = await fs.stat(appDirPath("bar.js"));
    await fs.outputJSON(appDirPath(".gadget/sync.json"), { app: "test", filesVersion: "1", mtime: stat.mtime.getTime() });

    // wait a bit so the mtime is different
    await sleep("10ms");

    // update a file
    fs.writeFileSync(appDirPath("bar.js"), "bar2", "utf8");

    // add a new file
    fs.writeFileSync(appDirPath("baz.js"), "baz", "utf8");

    const filesync = await FileSync.init({ user: testUser, dir: appDir, app: testApp.slug });
    await filesync.sync();

    await expect(published).resolves.toBeUndefined();
    expect(prompt.select).toHaveBeenCalled();
  });

  it("deletes local file changes and sets filesVersion to 0 when told to reset", async () => {
    vi.spyOn(prompt, "select").mockResolvedValue(Action.RESET);
    void nockEditGraphQLResponse({ query: REMOTE_FILES_VERSION_QUERY, result: { data: { remoteFilesVersion: "1" } } });

    await writeDir(appDir, {
      "foo.js": "foo",
      "bar.js": "bar",
    });

    const stat = fs.statSync(appDirPath("bar.js"));
    fs.outputJSONSync(appDirPath(".gadget/sync.json"), { app: "test", filesVersion: "1", mtime: stat.mtime.getTime() });

    // wait a bit so the mtime is different
    await sleep("10ms");

    // modify bar.js
    fs.writeFileSync(appDirPath("bar.js"), "bar2", "utf8");

    // add baz.js
    fs.writeFileSync(appDirPath("baz.js"), "baz", "utf8");

    const filesync = await FileSync.init({ user: testUser, dir: appDir, app: testApp.slug });
    await filesync.sync();

    const actual = await readDir(appDir);
    expect(actual).toEqual({
      ".gadget/": "",
      // @ts-expect-error _state is private
      ".gadget/sync.json": prettyJSON({ ...filesync._state, filesVersion: "1" }),
      ".gadget/backup/": "",
      ".gadget/backup/bar.js": "bar2",
      ".gadget/backup/baz.js": "baz",
      // foo.js didn't change, so it shouldn't be backed up
      "foo.js": "foo",
    });

    expect(filesync.filesVersion).toBe(0n);
  });
});
