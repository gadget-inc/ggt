import fs from "fs-extra";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as app from "../../../src/services/app.js";
import { ArgError, InvalidSyncFileError } from "../../../src/services/errors.js";
import { FileSync } from "../../../src/services/filesync/filesync.js";
import { expectError, testApp, testDirPath, testUser } from "../../util.js";

describe("filesync", () => {
  let dir: string;

  beforeEach(() => {
    dir = path.join(testDirPath(), "app");

    vi.spyOn(app, "getApps").mockResolvedValue([
      testApp,
      { id: 2, slug: "not-test", primaryDomain: "not-test.gadget.app", hasSplitEnvironments: false, user: testUser },
    ]);
  });

  describe("init", () => {
    it("ensures `dir` exists", async () => {
      expect(fs.existsSync(dir)).toBe(false);

      await FileSync.init(testUser, { dir, app: testApp.slug });

      expect(fs.existsSync(dir)).toBe(true);
    });

    it("loads state from .gadget/sync.json", async () => {
      const state = { app: testApp.slug, filesVersion: "77", mtime: 1658153625236 };
      await fs.outputJSON(path.join(dir, ".gadget/sync.json"), state);

      const filesync = await FileSync.init(testUser, { dir, app: testApp.slug });

      // @ts-expect-error _state is private
      expect(filesync._state).toEqual(state);
    });

    it("uses default state if .gadget/sync.json does not exist and `dir` is empty", async () => {
      const filesync = await FileSync.init(testUser, { dir, app: testApp.slug });

      // @ts-expect-error _state is private
      expect(filesync._state).toEqual({ app: "test", filesVersion: "0", mtime: 0 });
    });

    it("throws InvalidSyncFileError if .gadget/sync.json does not exist and `dir` is not empty", async () => {
      await fs.outputFile(path.join(dir, "foo.js"), "foo");

      await expect(FileSync.init(testUser, { dir, app: testApp.slug })).rejects.toThrow(InvalidSyncFileError);
    });

    it("throws InvalidSyncFileError if .gadget/sync.json is invalid", async () => {
      // has trailing comma
      await fs.outputFile(path.join(dir, ".gadget/sync.json"), '{"app":"test","filesVersion":"77","mtime":1658153625236,}');

      await expect(FileSync.init(testUser, { dir, app: testApp.slug })).rejects.toThrow(InvalidSyncFileError);
    });

    it("does not throw InvalidSyncFileError if .gadget/sync.json is invalid and `--force` is passed", async () => {
      // has trailing comma
      await fs.outputFile(path.join(dir, ".gadget/sync.json"), '{"app":"test","filesVersion":"77","mtime":1658153625236,}');

      const filesync = await FileSync.init(testUser, { dir, app: testApp.slug, force: true });

      // @ts-expect-error _state is private
      expect(filesync._state).toEqual({ app: testApp.slug, filesVersion: "0", mtime: 0 });
    });

    it("throws ArgError if the `--app` arg is passed a slug that does not exist within the user's available apps", async () => {
      const error = await expectError(() => FileSync.init(testUser, { dir, app: "does-not-exist" }));

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

      const error = await expectError(() => FileSync.init(testUser, { dir, app: "does-not-exist" }));

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`
            "You (test@example.com) don't have have any Gadget applications.

            Visit https://gadget.new to create one!"
          `);
    });

    it("throws ArgError if the `--app` flag is passed a different app name than the one in .gadget/sync.json", async () => {
      await fs.outputJson(path.join(dir, ".gadget/sync.json"), { app: "not-test", filesVersion: "77", mtime: 1658153625236 });

      const error = await expectError(() => FileSync.init(testUser, { dir, app: testApp.slug }));

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatch(/^You were about to sync the following app to the following directory:/);
    });

    it("does not throw ArgError if the `--app` flag is passed a different app name than the one in .gadget/sync.json and `--force` is passed", async () => {
      await fs.outputJson(path.join(dir, ".gadget/sync.json"), { app: "not-test", filesVersion: "77", mtime: 1658153625236 });

      const filesync = await FileSync.init(testUser, { dir, app: testApp.slug, force: true });

      // @ts-expect-error _state is private
      expect(filesync._state).toEqual({ app: testApp.slug, filesVersion: "0", mtime: 0 });
    });
  });

  describe("write", () => {
    it("removes old backup files before moving new files into place", async () => {
      const filesync = await FileSync.init(testUser, { dir, app: testApp.slug });

      // create a file named `foo.js`
      await fs.outputFile(filesync.absolute("foo.js"), "// foo");

      // create a directory named `.gadget/backup/foo.js`
      await fs.mkdirp(filesync.absolute(".gadget/backup/foo.js"));

      // tell filesync to delete foo.js, which should move it to .gadget/backup/foo.js
      // if the backup file is not removed first, this will fail with "Error: Cannot overwrite directory"
      await filesync.write(1n, [], ["foo.js"]);

      // foo.js should be gone
      await expect(fs.exists(filesync.absolute("foo.js"))).resolves.toBe(false);

      // .gadget/backup/foo.js should be the foo.js file that was deleted
      await expect(fs.readFile(filesync.absolute(".gadget/backup/foo.js"), "utf8")).resolves.toBe("// foo");
    });
  });
});
