import { describe, expect, it } from "vitest";
import { ALWAYS_IGNORE_PATHS, Directory, HASHING_IGNORE_PATHS } from "../../src/services/filesync/directory.js";

describe("Directory", () => {
  const directory = new Directory("/foo/bar", true);

  describe("relative", () => {
    it("converts an absolute path to a relative path", () => {
      expect(directory.relative("/foo/bar/baz")).toBe("baz");
    });

    it("returns the given path if it's already relative", () => {
      expect(directory.relative("baz")).toBe("baz");
    });

    it("strips ending slashes", () => {
      expect(directory.relative("/foo/bar/baz/")).toBe("baz");
    });
  });

  describe("absolute", () => {
    it("converts a relative path to an absolute path", () => {
      expect(directory.absolute("baz")).toBe("/foo/bar/baz");
    });

    it("returns the given path if it's already absolute", () => {
      expect(directory.absolute("/foo/bar/baz")).toBe("/foo/bar/baz");
    });

    it("strips ending slashes", () => {
      expect(directory.absolute("/foo/bar/baz/")).toBe("/foo/bar/baz");
    });
  });

  describe("normalize", () => {
    it("converts an absolute path to a relative path", () => {
      expect(directory.normalize("/foo/bar/baz", false)).toBe("baz");
    });

    it("removes a trailing slash if the path is a file", () => {
      expect(directory.normalize("/foo/bar/baz/", false)).toBe("baz");
    });

    it("adds a trailing slash if the path is a directory", () => {
      expect(directory.normalize("/foo/bar/baz", true)).toBe("baz/");
    });

    it("doesn't add an extra trailing slash if the path is a directory but already has a trailing slash", () => {
      expect(directory.normalize("/foo/bar/baz/", true)).toBe("baz/");
    });

    it("strips multiple slashes", () => {
      expect(directory.normalize("/foo//bar////baz//", true)).toBe("baz/");
    });

    it("converts windows paths to unix paths", () => {
      expect(directory.normalize("\\foo\\bar\\baz", true)).toBe("baz/");
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
