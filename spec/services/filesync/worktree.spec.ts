import path from "node:path";

import fs from "fs-extra";
import { describe, expect, it } from "vitest";

import { Directory } from "../../../src/services/filesync/directory.ts";
import { isLinkedWorktreeRoot } from "../../../src/services/filesync/worktree.ts";
import { writeDir } from "../../__support__/files.ts";
import { testDirPath } from "../../__support__/paths.ts";

const walk = async (directory: Directory): Promise<string[]> => {
  const paths = [];
  for await (const normalizedPath of directory.walk()) {
    paths.push(normalizedPath);
  }
  return paths.sort();
};

describe("isLinkedWorktreeRoot", () => {
  it.each([
    ["an absolute gitdir", "gitdir: /Users/jane/app/.git/worktrees/wt\n"],
    ["a relative gitdir", "gitdir: ../../.git/worktrees/wt\n"],
    ["a windows gitdir", "gitdir: C:\\Users\\jane\\app\\.git\\worktrees\\wt\r\n"],
    ["a bare repository's gitdir", "gitdir: /Users/jane/app.git/worktrees/wt\n"],
  ])("returns true when .git is a file with %s", async (_, dotGit) => {
    const dir = testDirPath();
    await fs.outputFile(path.join(dir, ".git"), dotGit);

    expect(isLinkedWorktreeRoot(dir)).toBe(true);
  });

  it.each([
    ["a submodule's gitdir", "gitdir: ../.git/modules/lib\n"],
    ["the gitdir of a submodule inside a worktree", "gitdir: ../../.git/worktrees/wt/modules/lib\n"],
    ["no gitdir line", "not a git file\n"],
  ])("returns false when .git is a file with %s", async (_, dotGit) => {
    const dir = testDirPath();
    await fs.outputFile(path.join(dir, ".git"), dotGit);

    expect(isLinkedWorktreeRoot(dir)).toBe(false);
  });

  it("returns false when .git is a directory", async () => {
    const dir = testDirPath();
    await fs.ensureDir(path.join(dir, ".git", "worktrees", "wt"));

    expect(isLinkedWorktreeRoot(dir)).toBe(false);
  });

  it("returns false when there is no .git", async () => {
    const dir = testDirPath();
    await fs.ensureDir(dir);

    expect(isLinkedWorktreeRoot(dir)).toBe(false);
    expect(isLinkedWorktreeRoot(path.join(dir, "does-not-exist"))).toBe(false);
  });
});

describe("Directory with nested git worktrees", () => {
  it("ignores a nested worktree and everything inside it", async () => {
    const dir = testDirPath();
    await writeDir(dir, {
      ".claude/worktrees/wt/.git": "gitdir: /Users/jane/app/.git/worktrees/wt\n",
      ".claude/worktrees/wt/app.js": "// worktree",
      ".claude/worktrees/wt/api/models/user/schema.gadget.ts": "// worktree",
      ".claude/settings.json": "{}",
      "app.js": "// app",
    });

    const directory = await Directory.init(dir);

    expect(directory.ignores(".claude/worktrees/wt", true)).toBe(true);
    expect(directory.ignores(".claude/worktrees/wt/app.js", false)).toBe(true);
    expect(directory.ignores(".claude/worktrees/wt/api/models/user/schema.gadget.ts", false)).toBe(true);
    expect(directory.ignores(path.join(dir, ".claude/worktrees/wt/app.js"), false)).toBe(true);

    expect(directory.ignores(".claude/worktrees", true)).toBe(false);
    expect(directory.ignores(".claude/settings.json", false)).toBe(false);
    expect(directory.ignores("app.js", false)).toBe(false);
  });

  it("doesn't walk or hash a nested worktree", async () => {
    const dir = testDirPath();
    await writeDir(dir, {
      "wt/.git": "gitdir: /Users/jane/app/.git/worktrees/wt\n",
      "wt/app.js": "// worktree",
      "app.js": "// app",
    });

    const directory = await Directory.init(dir);

    expect(await walk(directory)).toEqual(["app.js"]);
    expect(Object.keys(await directory.hashes())).toEqual(["app.js"]);
    expect(directory.nestedWorktreeRoots()).toEqual(new Set(["wt/"]));
  });

  it("doesn't ignore the synced directory when it is a worktree itself", async () => {
    const dir = testDirPath();
    await writeDir(dir, {
      ".git": "gitdir: /Users/jane/app/.git/worktrees/wt\n",
      "app.js": "// app",
    });

    const directory = await Directory.init(dir);

    expect(directory.ignores("app.js", false)).toBe(false);
    expect(await walk(directory)).toEqual(["app.js"]);
  });

  it("doesn't ignore nested full clones or submodules", async () => {
    const dir = testDirPath();
    await writeDir(dir, {
      "clone/.git/HEAD": "ref: refs/heads/main\n",
      "clone/lib.js": "// clone",
      "submodule/.git": "gitdir: ../.git/modules/submodule\n",
      "submodule/lib.js": "// submodule",
    });

    const directory = await Directory.init(dir);

    expect(await walk(directory)).toEqual(["clone/", "clone/lib.js", "submodule/", "submodule/lib.js"]);
    expect(directory.nestedWorktreeRoots().size).toBe(0);
  });

  it("keeps ignoring a worktree's deleted files while the worktree is being removed", async () => {
    const dir = testDirPath();
    await writeDir(dir, {
      "wt/.git": "gitdir: /Users/jane/app/.git/worktrees/wt\n",
      "wt/src/a.js": "// a",
      "wt/src/b.js": "// b",
    });

    const directory = await Directory.init(dir);
    expect(directory.ignores("wt/src/a.js", false)).toBe(true);

    // `git worktree remove` deletes the .git file along with everything else
    await fs.remove(path.join(dir, "wt/.git"));
    await fs.remove(path.join(dir, "wt/src/a.js"));

    expect(directory.ignores("wt/src/a.js", false)).toBe(true);
  });

  it("stops ignoring a former worktree once it's replaced with a regular directory", async () => {
    const dir = testDirPath();
    await writeDir(dir, {
      "wt/.git": "gitdir: /Users/jane/app/.git/worktrees/wt\n",
      "wt/a.js": "// a",
    });

    const directory = await Directory.init(dir);
    expect(directory.ignores("wt/a.js", false)).toBe(true);

    await fs.remove(path.join(dir, "wt"));
    await fs.outputFile(path.join(dir, "wt/new.js"), "// new");

    expect(directory.ignores("wt/new.js", false)).toBe(false);
    expect(directory.nestedWorktreeRoots().size).toBe(0);
  });

  it("forgets removed worktrees when hashing", async () => {
    const dir = testDirPath();
    await writeDir(dir, {
      "wt/.git": "gitdir: /Users/jane/app/.git/worktrees/wt\n",
      "wt/a.js": "// a",
      "app.js": "// app",
    });

    const directory = await Directory.init(dir);
    await directory.hashes();
    expect(directory.nestedWorktreeRoots()).toEqual(new Set(["wt/"]));

    await fs.remove(path.join(dir, "wt"));

    await directory.hashes();
    expect(directory.nestedWorktreeRoots().size).toBe(0);
  });

  it("detects a worktree created after the directory was initialized", async () => {
    const dir = testDirPath();
    await writeDir(dir, { "app.js": "// app" });

    const directory = await Directory.init(dir);
    expect(directory.ignores("wt/a.js", false)).toBe(false);

    await writeDir(dir, {
      "wt/.git": "gitdir: /Users/jane/app/.git/worktrees/wt\n",
      "wt/a.js": "// a",
    });

    expect(directory.ignores("wt/a.js", false)).toBe(true);
  });

  it("reports whether a path is inside a nested worktree without consulting .ignore", async () => {
    const dir = testDirPath();
    await writeDir(dir, {
      ".ignore": "tmp/",
      "wt/.git": "gitdir: /Users/jane/app/.git/worktrees/wt\n",
      "wt/a.js": "// a",
    });

    const directory = await Directory.init(dir);

    expect(directory.insideNestedWorktree("wt/a.js", false)).toBe(true);
    expect(directory.insideNestedWorktree("wt/", true)).toBe(true);
    expect(directory.insideNestedWorktree("tmp/a.js", false)).toBe(false);
    expect(directory.insideNestedWorktree("", true)).toBe(false);
    expect(directory.insideNestedWorktree(path.join(dir, ".."), true)).toBe(false);
  });
});
