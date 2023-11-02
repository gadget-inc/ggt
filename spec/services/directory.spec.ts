import fs from "fs-extra";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALWAYS_IGNORE_PATHS, Directory, HASHING_IGNORE_PATHS } from "../../src/services/filesync/directory.js";
import { testDirPath } from "../util.js";

describe("Directory", () => {
  describe("relative", () => {
    it("converts an absolute path to a relative path", () => {
      const directory = new Directory("/foo/bar", true);
      expect(directory.relative("/foo/bar/baz")).toBe("baz");
    });

    it("returns the given path if it's already relative", () => {
      const directory = new Directory("/foo/bar", true);
      expect(directory.relative("baz")).toBe("baz");
    });

    it("strips ending slashes", () => {
      const directory = new Directory("/foo/bar", true);
      expect(directory.relative("/foo/bar/baz/")).toBe("baz");
    });
  });

  describe("absolute", () => {
    it("converts a relative path to an absolute path", () => {
      const directory = new Directory("/foo/bar", true);
      expect(directory.absolute("baz")).toBe("/foo/bar/baz");
    });

    it("returns the given path if it's already absolute", () => {
      const directory = new Directory("/foo/bar", true);
      expect(directory.absolute("/foo/bar/baz")).toBe("/foo/bar/baz");
    });

    it("strips ending slashes", () => {
      const directory = new Directory("/foo/bar", true);
      expect(directory.absolute("/foo/bar/baz/")).toBe("/foo/bar/baz");
    });
  });

  describe("normalize", () => {
    it("converts an absolute path to a relative path", () => {
      const directory = new Directory("/foo/bar", true);
      expect(directory.normalize("/foo/bar/baz", false)).toBe("baz");
    });

    it("removes a trailing slash if the path is a file", () => {
      const directory = new Directory("/foo/bar", true);
      expect(directory.normalize("/foo/bar/baz/", false)).toBe("baz");
    });

    it("adds a trailing slash if the path is a directory", () => {
      const directory = new Directory("/foo/bar", true);
      expect(directory.normalize("/foo/bar/baz", true)).toBe("baz/");
    });

    it("doesn't add an extra trailing slash if the path is a directory but already has a trailing slash", () => {
      const directory = new Directory("/foo/bar", true);
      expect(directory.normalize("/foo/bar/baz/", true)).toBe("baz/");
    });

    it("strips multiple slashes", () => {
      const directory = new Directory("/foo/bar", true);
      expect(directory.normalize("/foo//bar////baz//", true)).toBe("baz/");
    });

    it("converts windows paths to unix paths", () => {
      const directory = new Directory("/foo/bar", true);
      expect(directory.normalize("\\foo\\bar\\baz", true)).toBe("baz/");
    });
  });

  describe("loadIgnoreFile", () => {
    it("loads the ignore file", async () => {
      const dir = testDirPath();
      const directory = new Directory(dir, true);

      expect(directory.ignores("foo")).toBe(false);

      await fs.outputFile(path.join(dir, ".ignore"), "foo");
      directory.loadIgnoreFile();

      expect(directory.ignores("foo")).toBe(true);
    });

    it("doesn't throw if the file/directory doesn't exist", async () => {
      const dir = testDirPath();
      const directory = new Directory(dir, true);

      await fs.remove(path.join(dir, ".ignore"));
      directory.loadIgnoreFile();

      await fs.remove(dir);
      directory.loadIgnoreFile();

      expect(true).toBe(true);
    });
  });

  describe("ignores", () => {
    it("returns false if given the root directory", () => {
      const dir = testDirPath();
      const directory = new Directory(dir, true);

      expect(directory.ignores(dir)).toBe(false);
    });

    it("return true if the path is above the root directory", () => {
      const dir = testDirPath();
      const directory = new Directory(dir, true);

      expect(directory.ignores(path.join(dir, ".."))).toBe(true);
    });

    it("returns true for all paths in ALWAYS_IGNORE_PATHS", () => {
      const dir = testDirPath();
      const directory = new Directory(dir, true);

      for (const path of ALWAYS_IGNORE_PATHS) {
        expect(directory.ignores(path)).toBe(true);
      }
    });

    it("returns true for all paths in HASHING_IGNORE_PATHS when hashing", () => {
      const dir = testDirPath();
      const directory = new Directory(dir, true);

      // @ts-expect-error isHashing is private
      directory._isHashing = true;

      for (const path of HASHING_IGNORE_PATHS) {
        expect(directory.ignores(path)).toBe(true);
      }
    });

    it("returns false for all paths in HASHING_IGNORE_PATHS when not hashing", () => {
      const dir = testDirPath();
      const directory = new Directory(dir, true);

      for (const path of HASHING_IGNORE_PATHS) {
        expect(directory.ignores(path)).toBe(false);
      }
    });
  });
});

describe("ALWAYS_IGNORE_PATHS", () => {
  it("contains the expected paths", () => {
    expect(ALWAYS_IGNORE_PATHS).toMatchInlineSnapshot(`
      [
        ".DS_Store",
        "node_modules",
        ".git",
      ]
    `);
  });
});

describe("HASHING_IGNORE_PATHS", () => {
  it("contains the expected paths", () => {
    expect(HASHING_IGNORE_PATHS).toMatchInlineSnapshot(`
      [
        ".gadget/sync.json",
        ".gadget/backup",
      ]
    `);
  });
});
