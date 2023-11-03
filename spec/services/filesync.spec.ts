import fs from "fs-extra";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as app from "../../src/services/app.js";
import { ArgError, InvalidSyncFileError } from "../../src/services/errors.js";
import { Directory } from "../../src/services/filesync/directory.js";
import { FileSync } from "../../src/services/filesync/filesync.js";
import * as prompt from "../../src/services/prompt.js";
import { expectError, prettyJSON, testApp, testDirPath, testUser, writeFiles, type Files } from "../util.js";

describe("filesync", () => {
  beforeEach(() => {
    vi.spyOn(app, "getApps").mockResolvedValue([
      testApp,
      { id: 2, slug: "not-test", primaryDomain: "not-test.gadget.app", hasSplitEnvironments: false, user: testUser },
    ]);
  });

  describe("init", () => {
    let dir: string;

    beforeEach(() => {
      dir = testDirPath("app");
    });

    it("ensures `dir` exists", async () => {
      expect(fs.existsSync(dir)).toBe(false);

      await FileSync.init({ user: testUser, dir, app: testApp.slug });

      expect(fs.existsSync(dir)).toBe(true);
    });

    it("loads state from .gadget/sync.json", async () => {
      const state = { app: testApp.slug, filesVersion: "77" };
      await fs.outputJSON(path.join(dir, ".gadget/sync.json"), state);

      const filesync = await FileSync.init({ user: testUser, dir, app: testApp.slug });

      // @ts-expect-error _state is private
      expect(filesync._state).toEqual(state);
    });

    it("uses default state if .gadget/sync.json does not exist and `dir` is empty", async () => {
      const filesync = await FileSync.init({ user: testUser, dir, app: testApp.slug });

      // @ts-expect-error _state is private
      expect(filesync._state).toEqual({ app: "test", filesVersion: "0" });
    });

    it("throws InvalidSyncFileError if .gadget/sync.json does not exist and `dir` is not empty", async () => {
      await fs.outputFile(path.join(dir, "foo.js"), "foo");

      await expect(FileSync.init({ user: testUser, dir, app: testApp.slug })).rejects.toThrow(InvalidSyncFileError);
    });

    it("throws InvalidSyncFileError if .gadget/sync.json is invalid", async () => {
      // has trailing comma
      await fs.outputFile(path.join(dir, ".gadget/sync.json"), '{"app":"test","filesVersion":"77",}');

      await expect(FileSync.init({ user: testUser, dir, app: testApp.slug })).rejects.toThrow(InvalidSyncFileError);
    });

    it("does not throw InvalidSyncFileError if .gadget/sync.json is invalid and `--force` is passed", async () => {
      // has trailing comma
      await fs.outputFile(path.join(dir, ".gadget/sync.json"), '{"app":"test","filesVersion":"77",}');

      const filesync = await FileSync.init({ user: testUser, dir, app: testApp.slug, force: true });

      // @ts-expect-error _state is private
      expect(filesync._state).toEqual({ app: testApp.slug, filesVersion: "0" });
    });

    it("throws ArgError if the `--app` arg is passed a slug that does not exist within the user's available apps", async () => {
      const error = await expectError(() => FileSync.init({ user: testUser, dir, app: "does-not-exist" }));

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

      const error = await expectError(() => FileSync.init({ user: testUser, dir, app: "does-not-exist" }));

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchInlineSnapshot(`
            "You (test@example.com) don't have have any Gadget applications.

            Visit https://gadget.new to create one!"
          `);
    });

    it("throws ArgError if the `--app` flag is passed a different app name than the one in .gadget/sync.json", async () => {
      await fs.outputJson(path.join(dir, ".gadget/sync.json"), { app: "not-test", filesVersion: "77" });

      const error = await expectError(() => FileSync.init({ user: testUser, dir, app: testApp.slug }));

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatch(/^You were about to sync the following app to the following directory:/);
    });

    it("does not throw ArgError if the `--app` flag is passed a different app name than the one in .gadget/sync.json and `--force` is passed", async () => {
      await fs.outputJson(path.join(dir, ".gadget/sync.json"), { app: "not-test", filesVersion: "77" });

      const filesync = await FileSync.init({ user: testUser, dir, app: testApp.slug, force: true });

      // @ts-expect-error _state is private
      expect(filesync._state).toEqual({ app: testApp.slug, filesVersion: "0" });
    });
  });

  describe("writeToLocalFilesystem", () => {
    let dir: string;

    beforeEach(() => {
      dir = testDirPath("app");
    });

    it("removes old backup files before moving new files into place", async () => {
      const filesync = await FileSync.init({ user: testUser, dir, app: testApp.slug });

      // create a file named `foo.js`
      await fs.outputFile(filesync.directory.absolute("foo.js"), "// foo");

      // create a directory named `.gadget/backup/foo.js`
      await fs.mkdirp(filesync.directory.absolute(".gadget/backup/foo.js"));

      // tell filesync to delete foo.js, which should move it to .gadget/backup/foo.js
      // if the backup file is not removed first, this will fail with "Error: Cannot overwrite directory"
      await filesync.writeToLocalFilesystem({ filesVersion: 1n, files: [], delete: ["foo.js"] });

      // foo.js should be gone
      await expect(fs.exists(filesync.directory.absolute("foo.js"))).resolves.toBe(false);

      // .gadget/backup/foo.js should be the foo.js file that was deleted
      await expect(fs.readFile(filesync.directory.absolute(".gadget/backup/foo.js"), "utf8")).resolves.toBe("// foo");
    });
  });

  describe("handleConflicts", () => {
    // let graphql: MockEditGraphQL;

    // beforeEach(() => {
    //   graphql = mockEditGraphQL();
    // });

    const setup = async ({
      gadgetFilesVersion,
      filesVersionFiles,
      localFiles,
      gadgetFiles,
    }: {
      gadgetFilesVersion?: bigint;
      filesVersionFiles: Files;
      localFiles: Files;
      gadgetFiles: Files;
    }): Promise<{ gadgetFilesVersion: bigint; filesVersionDir: Directory; localDir: Directory; gadgetDir: Directory }> => {
      const filesVersionDir = new Directory(testDirPath("filesVersion"), false);
      const localDir = new Directory(testDirPath("local"), false);
      const gadgetDir = new Directory(testDirPath("gadget"), false);

      await writeFiles(filesVersionDir.path, {
        // assume filesVersionDir has a .gadget/ dir
        ".gadget/": "",
        ...filesVersionFiles,
      });

      await writeFiles(gadgetDir.path, {
        // same for the gadgetDir
        ".gadget/": "",
        ...gadgetFiles,
      });

      await writeFiles(localDir.path, {
        ".gadget/sync.json": prettyJSON({ app: testApp.slug, filesVersion: "1" }),
        ...localFiles,
      });

      gadgetFilesVersion ??= 1n;

      vi.spyOn(FileSync.prototype, "getHashes").mockImplementation(async () => ({
        gadgetFilesVersion: gadgetFilesVersion!,
        filesVersionHashes: await filesVersionDir.hashes(),
        localHashes: await localDir.hashes(),
        gadgetHashes: await gadgetDir.hashes(),
      }));

      return { gadgetFilesVersion, filesVersionDir, localDir, gadgetDir };
    };

    it.only("does nothing if there aren't any changes", async () => {
      const { localDir } = await setup({
        filesVersionFiles: { "foo.js": "// foo" },
        localFiles: { "foo.js": "// foo" },
        gadgetFiles: { "foo.js": "// foo" },
      });

      const filesync = await FileSync.init({ user: testUser, dir: localDir.path });

      vi.spyOn(prompt, "confirm");
      vi.spyOn(prompt, "select");
      vi.spyOn(filesync, "receiveChangesFromGadget");
      vi.spyOn(filesync, "sendChangesToGadget");

      await filesync.handleConflicts();

      expect(prompt.confirm).not.toHaveBeenCalled();
      expect(prompt.select).not.toHaveBeenCalled();
      expect(filesync.receiveChangesFromGadget).not.toHaveBeenCalled();
      expect(filesync.sendChangesToGadget).not.toHaveBeenCalled();
    });
  });
});
