import fs from "fs-extra";
import nock from "nock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as app from "../../../src/services/app/app.js";
import { ArgError, InvalidSyncFileError } from "../../../src/services/error/error.js";
import { Changes } from "../../../src/services/filesync/changes.js";
import { supportsPermissions } from "../../../src/services/filesync/directory.js";
import { ConflictPreference, FileSync } from "../../../src/services/filesync/filesync.js";
import * as prompt from "../../../src/services/output/prompt.js";
import { testApp } from "../../__support__/app.js";
import { expectError } from "../../__support__/error.js";
import { expectDir, writeDir } from "../../__support__/files.js";
import { expectSyncJson, makeFile, makeSyncScenario } from "../../__support__/filesync.js";
import { testDirPath } from "../../__support__/paths.js";
import { expectProcessExit } from "../../__support__/process.js";
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

  it("uses default state if .gadget/sync.json does not exist and `dir` is not empty", async () => {
    await fs.outputFile(appDirPath("foo.js"), "foo");

    const filesync = await FileSync.init({ user: testUser, dir: appDir, app: testApp.slug });

    // @ts-expect-error _state is private
    expect(filesync._state).toEqual({ app: "test", filesVersion: "0", mtime: 0 });
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

  it("does nothing if there aren't any changes", async () => {
    const { filesync, expectLocalAndGadgetHashesMatch, expectFilesVersionDirs, expectGadgetDir, expectLocalDir } = await makeSyncScenario({
      filesVersion1Files: { "foo.js": "// foo" },
      localFiles: { "foo.js": "// foo" },
      gadgetFiles: { "foo.js": "// foo" },
    });

    vi.spyOn(prompt, "select").mockRejectedValue(new Error("should not select"));

    await filesync.sync();

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"1\\"}",
        "foo.js": "// foo",
      }
    `);

    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "foo.js": "// foo",
      }
    `);

    await expectFilesVersionDirs().resolves.toMatchInlineSnapshot(`
      {
        "1": {
          ".gadget/": "",
          "foo.js": "// foo",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("does nothing if only ignored files have changed", async () => {
    const { filesync, expectLocalDir, expectGadgetDir, expectLocalAndGadgetHashesMatch, expectFilesVersionDirs } = await makeSyncScenario({
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

    vi.spyOn(prompt, "select").mockRejectedValueOnce(new Error("should not select"));

    await filesync.sync();

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"1\\"}",
        ".ignore": "foo.js",
        "foo.js": "// foo (local)",
      }
    `);

    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".ignore": "foo.js",
        "foo.js": "// foo (gadget)",
      }
    `);

    await expectFilesVersionDirs().resolves.toMatchInlineSnapshot(`
      {
        "1": {
          ".gadget/": "",
          ".ignore": "foo.js",
          "foo.js": "// foo",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`exits the process when "${ConflictPreference.CANCEL}" is chosen`, async () => {
    const { filesync, expectFilesVersionDirs, expectLocalDir, expectGadgetDir } = await makeSyncScenario({
      filesVersion1Files: { "foo.js": "foo" },
      localFiles: { "foo.js": "foo (local)" },
      gadgetFiles: { "foo.js": "foo (gadget)" },
    });

    vi.spyOn(prompt, "select").mockResolvedValue(ConflictPreference.CANCEL);

    await expectProcessExit(() => filesync.sync());

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"1\\"}",
        "foo.js": "foo (local)",
      }
    `);

    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "foo.js": "foo (gadget)",
      }
    `);

    await expectFilesVersionDirs().resolves.toMatchInlineSnapshot(`
      {
        "1": {
          ".gadget/": "",
          "foo.js": "foo",
        },
        "2": {
          ".gadget/": "",
          "foo.js": "foo (gadget)",
        },
      }
    `);
  });

  it(`uses local conflicting changes when "${ConflictPreference.LOCAL}" is chosen`, async () => {
    const { filesync, expectLocalDir, expectGadgetDir, expectLocalAndGadgetHashesMatch, expectFilesVersionDirs } = await makeSyncScenario({
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

    vi.spyOn(prompt, "select").mockResolvedValue(ConflictPreference.LOCAL);

    await filesync.sync();

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
        "foo.js": "// foo (local)",
      }
    `);

    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "foo.js": "// foo (local)",
      }
    `);

    await expectFilesVersionDirs().resolves.toMatchInlineSnapshot(`
      {
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
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses gadget's conflicting changes when "${ConflictPreference.GADGET}" is chosen`, async () => {
    const { filesync, expectLocalDir, expectGadgetDir, expectLocalAndGadgetHashesMatch, expectFilesVersionDirs } = await makeSyncScenario({
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

    vi.spyOn(prompt, "select").mockResolvedValue(ConflictPreference.GADGET);

    await filesync.sync();

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\"}",
        "foo.js": "// foo (gadget)",
      }
    `);

    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "foo.js": "// foo (gadget)",
      }
    `);

    await expectFilesVersionDirs().resolves.toMatchInlineSnapshot(`
      {
        "1": {
          ".gadget/": "",
          "foo.js": "// foo",
        },
        "2": {
          ".gadget/": "",
          "foo.js": "// foo (gadget)",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("automatically merges non-conflicting changes if there are no conflicting changes", async () => {
    const { filesync, expectLocalDir, expectGadgetDir, expectLocalAndGadgetHashesMatch, expectFilesVersionDirs } = await makeSyncScenario({
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

    vi.spyOn(prompt, "select").mockRejectedValue(new Error("should not select"));

    await filesync.sync();

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
        "foo.js": "// foo",
        "gadget-file.js": "// gadget",
        "local-file.js": "// local",
      }
    `);

    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "foo.js": "// foo",
        "gadget-file.js": "// gadget",
        "local-file.js": "// local",
      }
    `);

    await expectFilesVersionDirs().resolves.toMatchInlineSnapshot(`
      {
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
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses local conflicting changes and merges non-conflicting gadget changes when "${ConflictPreference.LOCAL}" is chosen`, async () => {
    const { filesync, expectLocalDir, expectGadgetDir, expectLocalAndGadgetHashesMatch, expectFilesVersionDirs } = await makeSyncScenario({
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

    vi.spyOn(prompt, "select").mockResolvedValue(ConflictPreference.LOCAL);

    await filesync.sync();

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
        "foo.js": "// foo (local)",
        "gadget-file.js": "// gadget",
        "local-file.js": "// local",
      }
    `);

    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "foo.js": "// foo (local)",
        "gadget-file.js": "// gadget",
        "local-file.js": "// local",
      }
    `);

    await expectFilesVersionDirs().resolves.toMatchInlineSnapshot(`
      {
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
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses gadget's conflicting changes and merges non-conflicting local changes when "${ConflictPreference.GADGET}" is chosen`, async () => {
    const { filesync, expectLocalDir, expectGadgetDir, expectLocalAndGadgetHashesMatch, expectFilesVersionDirs } = await makeSyncScenario({
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

    vi.spyOn(prompt, "select").mockResolvedValue(ConflictPreference.GADGET);

    await filesync.sync();

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
        "foo.js": "// foo (gadget)",
        "gadget-file.js": "// gadget",
        "local-file.js": "// local",
      }
    `);

    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        "foo.js": "// foo (gadget)",
        "gadget-file.js": "// gadget",
        "local-file.js": "// local",
      }
    `);

    await expectFilesVersionDirs().resolves.toMatchInlineSnapshot(`
      {
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
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("uses gadget's conflicting changes if the conflicts are in the .gadget directory", async () => {
    const { filesync, expectLocalDir, expectGadgetDir, expectLocalAndGadgetHashesMatch, expectFilesVersionDirs } = await makeSyncScenario({
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

    vi.spyOn(prompt, "select").mockRejectedValueOnce(new Error("should not select"));

    await filesync.sync();

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/client.js": "// client (gadget)",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\"}",
      }
    `);

    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/client.js": "// client (gadget)",
      }
    `);

    await expectFilesVersionDirs().resolves.toMatchInlineSnapshot(`
      {
        "1": {
          ".gadget/": "",
          ".gadget/client.js": "// client",
        },
        "2": {
          ".gadget/": "",
          ".gadget/client.js": "// client (gadget)",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses gadget's conflicting changes in the .gadget directory even if "${ConflictPreference.LOCAL}" is chosen`, async () => {
    const { filesync, expectLocalDir, expectGadgetDir, expectLocalAndGadgetHashesMatch, expectFilesVersionDirs } = await makeSyncScenario({
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

    vi.spyOn(prompt, "select").mockResolvedValueOnce(ConflictPreference.LOCAL);

    await filesync.sync();

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/client.js": "// client (gadget)",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"3\\"}",
        "foo.js": "// foo (local)",
      }
    `);

    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/client.js": "// client (gadget)",
        "foo.js": "// foo (local)",
      }
    `);

    await expectFilesVersionDirs().resolves.toMatchInlineSnapshot(`
      {
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
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("fetches .gadget/ files when the local filesystem doesn't have them", async () => {
    const { filesync, expectLocalDir, expectGadgetDir, expectLocalAndGadgetHashesMatch, expectFilesVersionDirs } = await makeSyncScenario({
      filesVersion1Files: {
        ".gadget/client.js": "// client",
      },
      localFiles: {},
      gadgetFiles: {
        ".gadget/client.js": "// client",
      },
    });

    await filesync.sync();

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/client.js": "// client",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"1\\"}",
      }
    `);

    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/client.js": "// client",
      }
    `);

    await expectFilesVersionDirs().resolves.toMatchInlineSnapshot(`
      {
        "1": {
          ".gadget/": "",
          ".gadget/client.js": "// client",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("merges files when .gadget/sync.json doesn't exist", async () => {
    const { filesync, expectLocalDir, expectGadgetDir, expectLocalAndGadgetHashesMatch, expectFilesVersionDirs } = await makeSyncScenario({
      filesVersion1Files: {
        ".gadget/client.js": "// client",
        ".gadget/server.js": "// server",
        "gadget-file.js": "// gadget",
      },
      localFiles: {
        // mimic .gadget/sync.json not existing
        ".gadget/sync.json": '{"app":"test","filesVersion":"0","mtime":0}',
        "local-file.js": "// local",
      },
      gadgetFiles: {
        ".gadget/client.js": "// client",
        ".gadget/server.js": "// server",
        "gadget-file.js": "// gadget",
      },
    });

    await filesync.sync();

    await expectLocalDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/client.js": "// client",
        ".gadget/server.js": "// server",
        ".gadget/sync.json": "{\\"app\\":\\"test\\",\\"filesVersion\\":\\"2\\"}",
        "gadget-file.js": "// gadget",
        "local-file.js": "// local",
      }
    `);

    await expectGadgetDir().resolves.toMatchInlineSnapshot(`
      {
        ".gadget/": "",
        ".gadget/client.js": "// client",
        ".gadget/server.js": "// server",
        "gadget-file.js": "// gadget",
        "local-file.js": "// local",
      }
    `);

    await expectFilesVersionDirs().resolves.toMatchInlineSnapshot(`
      {
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
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });
});
