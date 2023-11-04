import fs from "fs-extra";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { omit } from "../../src/services/collections.js";
import { ALWAYS_IGNORE_PATHS, Directory, HASHING_IGNORE_PATHS } from "../../src/services/filesync/directory.js";
import { writeFiles, type Files } from "../__support__/files.js";
import { appFixturePath, testDirPath } from "../__support__/paths.js";

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

      // @ts-expect-error _ignorer and _rules are private
      expect(directory._ignorer._rules).toMatchInlineSnapshot(`
        [
          IgnoreRule {
            "negative": false,
            "origin": ".DS_Store",
            "pattern": ".DS_Store",
            "regex": /\\(\\?:\\^\\|\\\\/\\)\\\\\\.DS_Store\\(\\?=\\$\\|\\\\/\\$\\)/i,
          },
          IgnoreRule {
            "negative": false,
            "origin": "node_modules",
            "pattern": "node_modules",
            "regex": /\\(\\?:\\^\\|\\\\/\\)node_modules\\(\\?=\\$\\|\\\\/\\$\\)/i,
          },
          IgnoreRule {
            "negative": false,
            "origin": ".git",
            "pattern": ".git",
            "regex": /\\(\\?:\\^\\|\\\\/\\)\\\\\\.git\\(\\?=\\$\\|\\\\/\\$\\)/i,
          },
        ]
      `);

      await fs.outputFile(path.join(dir, ".ignore"), "foo");
      directory.loadIgnoreFile();

      // @ts-expect-error _ignorer and _rules are private
      expect(directory._ignorer._rules).toMatchInlineSnapshot(`
        [
          IgnoreRule {
            "negative": false,
            "origin": ".DS_Store",
            "pattern": ".DS_Store",
            "regex": /\\(\\?:\\^\\|\\\\/\\)\\\\\\.DS_Store\\(\\?=\\$\\|\\\\/\\$\\)/i,
          },
          IgnoreRule {
            "negative": false,
            "origin": "node_modules",
            "pattern": "node_modules",
            "regex": /\\(\\?:\\^\\|\\\\/\\)node_modules\\(\\?=\\$\\|\\\\/\\$\\)/i,
          },
          IgnoreRule {
            "negative": false,
            "origin": ".git",
            "pattern": ".git",
            "regex": /\\(\\?:\\^\\|\\\\/\\)\\\\\\.git\\(\\?=\\$\\|\\\\/\\$\\)/i,
          },
          IgnoreRule {
            "negative": false,
            "origin": "foo",
            "pattern": "foo",
            "regex": /\\(\\?:\\^\\|\\\\/\\)foo\\(\\?=\\$\\|\\\\/\\$\\)/i,
          },
        ]
      `);
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
    it("returns true for all paths in the ignore file", async () => {
      const dir = testDirPath();
      const directory = new Directory(dir, true);

      expect(directory.ignores("foo")).toBe(false);
      expect(directory.ignores("bar")).toBe(false);
      expect(directory.ignores("baz")).toBe(false);

      await fs.outputFile(testDirPath(".ignore"), "foo\nbar\nbaz");
      directory.loadIgnoreFile();

      expect(directory.ignores("foo")).toBe(true);
      expect(directory.ignores("bar")).toBe(true);
      expect(directory.ignores("baz")).toBe(true);
    });

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

      // @ts-expect-error _isHashing is private
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

  describe("walk", () => {
    it("yields each file and directory within it", async () => {
      const dir = testDirPath();
      const directory = new Directory(dir, false);

      const expected: Files = {
        "foo.txt": "foo",
        "bar.txt": "bar",
        "baz/": "",
        "baz/qux.txt": "qux",
      };

      await writeFiles(dir, expected);

      const actual = {} as Files;
      for await (const normalizedPath of directory.walk()) {
        actual[normalizedPath] = "";

        const stats = await fs.stat(path.join(dir, normalizedPath));
        if (stats.isFile()) {
          actual[normalizedPath] = await fs.readFile(path.join(dir, normalizedPath), "utf8");
        }
      }

      expect(actual).toEqual(expected);
    });

    it("doesn't yield ignored files", async () => {
      const dir = testDirPath();

      const expected = omit(
        await writeFiles(dir, {
          ".ignore": "baz",
          "foo.txt": "foo",
          "bar.txt": "bar",
          "baz/": "",
          "baz/qux.txt": "qux",
        }),
        ["baz/", "baz/qux.txt"],
      );

      const directory = new Directory(dir, false);

      const actual = {} as Files;
      for await (const normalizedPath of directory.walk()) {
        actual[normalizedPath] = "";

        const stats = await fs.stat(path.join(dir, normalizedPath));
        if (stats.isFile()) {
          actual[normalizedPath] = await fs.readFile(path.join(dir, normalizedPath), "utf8");
        }
      }

      expect(actual).toEqual(expected);
    });
  });

  describe("hashes", () => {
    it("produces the expected result", async () => {
      const hashes = await new Directory(appFixturePath(), false).hashes();
      expect(hashes).toMatchSnapshot();
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
