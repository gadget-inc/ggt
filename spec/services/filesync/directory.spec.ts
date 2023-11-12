/**
 * DO NOT MODIFY
 *
 * Everything in this file also exists in Gadget to ensure that this
 * logic is the same between the two projects.
 */
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, test } from "vitest";
import { mapValues } from "../../../src/services/collections.js";
import { ALWAYS_IGNORE_PATHS, Directory, HASHING_IGNORE_PATHS, supportsPermissions } from "../../../src/services/filesync/directory.js";
import { writeDir, type Files } from "../../__support__/files.js";
import { appFixturePath, testDirPath } from "../../__support__/paths.js";

describe("Directory.relative", () => {
  it("converts an absolute path to a relative path", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    const filepath = `${dir}${path.sep}baz`;
    expect(directory.relative(filepath)).toBe("baz");
  });

  it("returns the given path if it's already relative", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    const filepath = "baz";
    expect(directory.relative(filepath)).toBe("baz");
  });

  it("strips ending slashes", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    const filepath = `${dir}${path.sep}baz${path.sep}`;
    expect(directory.relative(filepath)).toBe("baz");
  });
});

describe("Directory.absolute", () => {
  it("converts a relative path to an absolute path", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    const filepath = "baz";
    expect(directory.absolute(filepath)).toBe(`${dir}${path.sep}baz`);
  });

  it("returns the given path if it's already absolute and within the directory", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    const filepath = `${dir}${path.sep}baz`;
    expect(directory.absolute(filepath)).toBe(filepath);
  });

  it("throws if the given path is already absolute and outside the directory", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    const filepath = `${path.sep}some${path.sep}other${path.sep}path`;
    expect(() => directory.absolute(filepath)).toThrow();
  });

  it("strips ending slashes", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    const filepath = `${dir}${path.sep}baz${path.sep}`;
    expect(directory.absolute(filepath)).toBe(filepath.slice(0, -1));
  });
});

describe("Directory.normalize", () => {
  it("converts an absolute path to a relative path", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    const filepath = `${dir}${path.sep}baz`;
    expect(directory.normalize(filepath, false)).toBe("baz");
  });

  it("removes a trailing slash if the path is a file", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    const filepath = `${dir}${path.sep}baz${path.sep}`;
    expect(directory.normalize(filepath, false)).toBe("baz");
  });

  it("adds a trailing slash if the path is a directory", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    const filepath = `${dir}${path.sep}baz`;
    expect(directory.normalize(filepath, true)).toBe("baz/");
  });

  it("doesn't add an extra trailing slash if the path is a directory but already has a trailing slash", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    const filepath = `${dir}${path.sep}baz${path.sep}`;
    expect(directory.normalize(filepath, true)).toBe("baz/");
  });

  it("strips multiple slashes", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    // duplicate all slashes
    const filepath = (dir + `${path.sep}baz${path.sep}`).replaceAll(path.sep, path.sep + path.sep);
    expect(directory.normalize(filepath, true)).toBe("baz/");
  });

  if (os.platform() === "win32") {
    it("converts windows paths to unix paths", async () => {
      const dir = testDirPath();
      const directory = await Directory.init(dir);
      const filepath = `${dir}\\baz\\`;
      expect(directory.normalize(filepath, true)).toBe("baz/");
    });
  }
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
    await directory.loadIgnoreFile();

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

  it("doesn't throw if the ignore file doesn't exist", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);

    await fs.remove(path.join(dir, ".ignore"));
    await expect(directory.loadIgnoreFile()).resolves.toBeUndefined();

    await fs.remove(dir);
    await expect(directory.loadIgnoreFile()).resolves.toBeUndefined();
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
    await directory.loadIgnoreFile();

    expect(directory.ignores("foo")).toBe(true);
    expect(directory.ignores("bar")).toBe(true);
    expect(directory.ignores("baz")).toBe(true);
  });

  it("returns false if given the root directory", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    const filepath = dir;
    expect(directory.ignores(filepath)).toBe(false);
  });

  it("return true if the path is above the root directory", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    const filepath = path.join(dir, "..");
    expect(directory.ignores(filepath)).toBe(true);
  });

  it("returns true for all paths in ALWAYS_IGNORE_PATHS", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);

    for (const filepath of ALWAYS_IGNORE_PATHS) {
      expect(directory.ignores(filepath)).toBe(true);
    }
  });

  it("returns true for all paths in HASHING_IGNORE_PATHS when hashing", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);

    // @ts-expect-error _isHashing is private
    directory._isHashing = true;

    for (const filepath of HASHING_IGNORE_PATHS) {
      expect(directory.ignores(filepath)).toBe(true);
    }
  });

  it("returns false for all paths in HASHING_IGNORE_PATHS when not hashing", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);

    for (const filepath of HASHING_IGNORE_PATHS) {
      expect(directory.ignores(filepath)).toBe(false);
    }
  });
});

describe("Directory.walk", () => {
  it("yields each file and directory within it", async () => {
    const dir = testDirPath();
    const directory = await Directory.init(dir);
    const expected = {
      "foo.txt": "foo",
      "bar.txt": "bar",
      "baz/": "",
      "baz/qux.txt": "qux",
    };

    await writeDir(dir, expected);

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
    await writeDir(dir, {
      ".ignore": "baz",
      "foo.txt": "foo",
      "bar.txt": "bar",
      "baz/": "",
      "baz/qux.txt": "qux",
    });

    const directory = await Directory.init(dir);

    const yielded = {} as Files;
    for await (const normalizedPath of directory.walk()) {
      yielded[normalizedPath] = "";

      const stats = await fs.stat(path.join(dir, normalizedPath));
      if (stats.isFile()) {
        yielded[normalizedPath] = await fs.readFile(path.join(dir, normalizedPath), "utf8");
      }
    }

    expect(yielded).toEqual({
      ".ignore": "baz",
      "foo.txt": "foo",
      "bar.txt": "bar",
    });
  });
});

describe("Directory.hashes", () => {
  it("produces the expected result", async () => {
    const directory = await Directory.init(appFixturePath());
    const hashes = await directory.hashes();
    expect(mapValues(hashes, (hash) => hash.sha1)).toMatchSnapshot();

    if (supportsPermissions) {
      expect(mapValues(hashes, (hash) => hash.permissions!.toString(8))).toMatchSnapshot();
    } else {
      expect(mapValues(hashes, (hash) => hash.permissions)).toEqual(mapValues(hashes, () => undefined));
    }

    expect.assertions(2);
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

const Read = 0o4;
const Write = 0o2;
const Execute = 0o1;

const Permissions = {
  Read: Read,
  Write: Write,
  Execute: Execute,
  ReadWrite: Read | Write,
  ReadExecute: Read | Execute,
  WriteExecute: Write | Execute,
  ReadWriteExecute: Read | Write | Execute,
} as const;

const Other = Permissions;
const Group = mapValues(Permissions, (mode) => mode << 3);
const User = mapValues(Permissions, (mode) => mode << 6);

const modes = {} as Record<string, number>;
for (const user of Object.keys(User)) {
  for (const group of Object.keys(Group)) {
    // eslint-disable-next-line max-depth
    for (const other of Object.keys(Other)) {
      const mode = User[user as keyof typeof User] | Group[group as keyof typeof Group] | Other[other as keyof typeof Other];
      modes[mode.toString(8)] = mode;
    }
  }
}

test.runIf(supportsPermissions && (process.getuid?.() === 0 || process.env["CI"])).each(Object.entries(modes))(
  "we can set a file/folder's mode to %s",
  async (formatted, mode) => {
    const filename = testDirPath(`${formatted}.txt`);
    await fs.outputFile(filename, "");
    await fs.chmod(filename, mode);

    let stats = await fs.stat(filename);
    expect.soft(stats.mode & 0o777).toBe(mode);

    const dirname = testDirPath(formatted);
    await fs.mkdir(dirname);
    await fs.chmod(dirname, mode);

    stats = await fs.stat(dirname);
    expect.soft(stats.mode & 0o777).toBe(mode);
  },
);
