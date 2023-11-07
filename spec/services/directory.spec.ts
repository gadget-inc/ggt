/**
 * DO NOT MODIFY
 *
 * Everything in this file also exists in Gadget to ensure that this
 * logic is the same between the two projects.
 */
import fs from "fs-extra";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALWAYS_IGNORE_PATHS, Directory, HASHING_IGNORE_PATHS } from "../../src/services/filesync/directory.js";
import { Files, writeFiles } from "../__support__/files.js";
import { appFixturePath, testDirPath } from "../__support__/paths.js";

describe("Directory.relative", () => {
  it("converts an absolute path to a relative path", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    expect(directory.relative(`${dir}/baz`)).toBe("baz");
  });

  it("returns the given path if it's already relative", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    expect(directory.relative("baz")).toBe("baz");
  });

  it("strips ending slashes", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    expect(directory.relative(dir + "/baz/")).toBe("baz");
  });
});

describe("Directory.absolute", () => {
  it("converts a relative path to an absolute path", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    expect(directory.absolute("baz")).toBe(`${dir}/baz`);
  });

  it("returns the given path if it's already absolute", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    expect(directory.absolute(`${dir}`)).toBe(`${dir}`);
  });

  it("strips ending slashes", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    expect(directory.absolute(`${dir}/`)).toBe(`${dir}`);
  });
});

describe("Directory.normalize", () => {
  it("converts an absolute path to a relative path", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    expect(directory.normalize(`${dir}/baz`, false)).toBe("baz");
  });

  it("removes a trailing slash if the path is a file", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    expect(directory.normalize(`${dir}/baz/`, false)).toBe("baz");
  });

  it("adds a trailing slash if the path is a directory", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    expect(directory.normalize(`${dir}/baz`, true)).toBe("baz/");
  });

  it("doesn't add an extra trailing slash if the path is a directory but already has a trailing slash", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    expect(directory.normalize(`${dir}/baz/`, true)).toBe("baz/");
  });

  it("strips multiple slashes", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    expect(directory.normalize(dir.replaceAll("/", "//") + "//baz//", true)).toBe("baz/");
  });

  it("converts windows paths to unix paths", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    expect(directory.normalize(dir.replaceAll("/", "\\") + "\\baz\\", true)).toBe("baz/");
  });
});

describe("Directory.loadIgnoreFile", () => {
  it("loads the ignore file", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);

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
    const directory = await Directory.init(dir);

    await fs.remove(path.join(dir, ".ignore"));
    directory.loadIgnoreFile();

    await fs.remove(dir);
    directory.loadIgnoreFile();

    expect(true).toBe(true);
  });
});

describe("Directory.ignores", () => {
  it("returns true for all paths in the ignore file", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);

    expect(directory.ignores("foo")).toBe(false);
    expect(directory.ignores("bar")).toBe(false);
    expect(directory.ignores("baz")).toBe(false);

    await fs.outputFile(testDirPath(".ignore"), "foo\nbar\nbaz");
    directory.loadIgnoreFile();

    expect(directory.ignores("foo")).toBe(true);
    expect(directory.ignores("bar")).toBe(true);
    expect(directory.ignores("baz")).toBe(true);
  });

  it("returns false if given the root directory", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);

    expect(directory.ignores(dir)).toBe(false);
  });

  it("return true if the path is above the root directory", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);

    expect(directory.ignores(path.join(dir, ".."))).toBe(true);
  });

  it("returns true for all paths in ALWAYS_IGNORE_PATHS", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);

    for (const path of ALWAYS_IGNORE_PATHS) {
      expect(directory.ignores(path)).toBe(true);
    }
  });

  it("returns true for all paths in HASHING_IGNORE_PATHS when hashing", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);

    // @ts-expect-error _isHashing is private
    directory._isHashing = true;

    for (const path of HASHING_IGNORE_PATHS) {
      expect(directory.ignores(path)).toBe(true);
    }
  });

  it("returns false for all paths in HASHING_IGNORE_PATHS when not hashing", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);

    for (const path of HASHING_IGNORE_PATHS) {
      expect(directory.ignores(path)).toBe(false);
    }
  });
});

describe("Directory.walk", () => {
  it("yields each file and directory within it", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    const expected = Files.parse({
      "foo.txt": "foo",
      "bar.txt": "bar",
      "baz/": "",
      "baz/qux.txt": "qux",
    });

    await writeFiles(dir, expected);

    const actual = Files.parse({});
    for await (const normalizedPath of directory.walk()) {
      actual.set(normalizedPath, "");

      const stats = await fs.stat(path.join(dir, normalizedPath));
      if (stats.isFile()) {
        actual.set(normalizedPath, await fs.readFile(path.join(dir, normalizedPath), "utf8"));
      }
    }

    expect(actual).toMatchInlineSnapshot(`
      Map {
        "foo.txt" => "foo",
        "bar.txt" => "bar",
        "baz/" => "",
        "baz/qux.txt" => "qux",
      }
    `);
  });

  it("doesn't yield ignored files", async () => {
    const dir = testDirPath();
    await writeFiles(dir, {
      ".ignore": "baz",
      "foo.txt": "foo",
      "bar.txt": "bar",
      "baz/": "",
      "baz/qux.txt": "qux",
    });

    const directory = await Directory.init(dir);

    const yielded = Files.parse({});
    for await (const normalizedPath of directory.walk()) {
      yielded.set(normalizedPath, "");

      const stats = await fs.stat(path.join(dir, normalizedPath));
      if (stats.isFile()) {
        yielded.set(normalizedPath, await fs.readFile(path.join(dir, normalizedPath), "utf8"));
      }
    }

    expect(yielded).toMatchInlineSnapshot(`
      Map {
        ".ignore" => "baz",
        "foo.txt" => "foo",
        "bar.txt" => "bar",
      }
    `);
  });
});

describe("Directory.hashes", () => {
  it("produces the expected result", async () => {
    const directory = await Directory.init(appFixturePath());
    await expect(directory.hashes()).resolves.toMatchSnapshot();
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
