import path from "node:path";

import fs from "fs-extra";
import { describe, expect, it } from "vitest";

import { Directory } from "../../../src/services/filesync/directory.ts";
import { isLinkedWorktreeRoot, NestedWorktrees } from "../../../src/services/filesync/worktree.ts";
import { writeDir } from "../../__support__/files.ts";
import { testDirPath } from "../../__support__/paths.ts";
import { makeWorktreeGitDir } from "../../__support__/worktree.ts";

const walk = async (directory: Directory): Promise<string[]> => {
  const paths = [];
  for await (const normalizedPath of directory.walk()) {
    paths.push(normalizedPath);
  }
  return paths.sort();
};

describe("isLinkedWorktreeRoot", () => {
  it("returns true when .git points at a worktree's git directory with a relative path", async () => {
    const dir = testDirPath("app", "wt");
    const { dotGit } = await makeWorktreeGitDir(dir);
    await fs.outputFile(path.join(dir, ".git"), dotGit);

    expect(isLinkedWorktreeRoot(dir)).toBe(true);
  });

  it("returns true when .git points at a worktree's git directory with an absolute path", async () => {
    const dir = testDirPath("app", "wt");
    const { gitDir } = await makeWorktreeGitDir(dir);
    await fs.outputFile(path.join(dir, ".git"), `gitdir: ${gitDir}\r\n`);

    expect(isLinkedWorktreeRoot(dir)).toBe(true);
  });

  it("returns false for a repository made with `git init --separate-git-dir`", async () => {
    const dir = testDirPath("app", "project");
    // the git directory's path ends in worktrees/<name>, but it's a
    // regular git directory, so it has no commondir file
    const gitDir = testDirPath("srv", "worktrees", "project");
    await fs.outputFile(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
    await fs.outputFile(path.join(dir, ".git"), `gitdir: ${gitDir}\n`);

    expect(isLinkedWorktreeRoot(dir)).toBe(false);
  });

  it("returns false for a submodule", async () => {
    const dir = testDirPath("app", "lib");
    await fs.outputFile(testDirPath("app", ".git", "modules", "lib", "HEAD"), "ref: refs/heads/main\n");
    await fs.outputFile(path.join(dir, ".git"), "gitdir: ../.git/modules/lib\n");

    expect(isLinkedWorktreeRoot(dir)).toBe(false);
  });

  it("returns false when .git points at a git directory that doesn't exist", async () => {
    const dir = testDirPath("app", "wt");
    await fs.outputFile(path.join(dir, ".git"), "gitdir: /does/not/exist/.git/worktrees/wt\n");

    expect(isLinkedWorktreeRoot(dir)).toBe(false);
  });

  it("returns false when .git has no gitdir line", async () => {
    const dir = testDirPath("app", "wt");
    await fs.outputFile(path.join(dir, ".git"), "not a git file\n");

    expect(isLinkedWorktreeRoot(dir)).toBe(false);
  });

  it("returns false when .git is a directory", async () => {
    const dir = testDirPath("app", "clone");
    await fs.outputFile(path.join(dir, ".git", "commondir"), "../..\n");

    expect(isLinkedWorktreeRoot(dir)).toBe(false);
  });

  it("returns false when there is no .git", async () => {
    const dir = testDirPath("app");
    await fs.ensureDir(dir);

    expect(isLinkedWorktreeRoot(dir)).toBe(false);
    expect(isLinkedWorktreeRoot(path.join(dir, "does-not-exist"))).toBe(false);
  });
});

describe("NestedWorktrees.contains", () => {
  it("detects a worktree that git sets up after a scan has already checked its directory", async () => {
    const dir = testDirPath("app");
    await fs.ensureDir(path.join(dir, "wt"));

    const worktrees = new NestedWorktrees(dir);
    worktrees.startScan();

    // the walk sees wt/ after `git worktree add` creates it but before
    // it writes wt/.git
    expect(worktrees.contains("wt/", true)).toBe(false);

    const { dotGit } = await makeWorktreeGitDir(path.join(dir, "wt"));
    await writeDir(dir, { "wt/.git": dotGit, "wt/a.js": "// a" });

    expect(worktrees.contains("wt/a.js", false)).toBe(true);
    worktrees.endScan();
  });
});

describe("Directory with nested git worktrees", () => {
  it("ignores a nested worktree and everything inside it", async () => {
    const dir = testDirPath("app");
    const { dotGit } = await makeWorktreeGitDir(path.join(dir, ".claude/worktrees/wt"));
    await writeDir(dir, {
      ".claude/worktrees/wt/.git": dotGit,
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
    const dir = testDirPath("app");
    const { dotGit } = await makeWorktreeGitDir(path.join(dir, "wt"));
    await writeDir(dir, {
      "wt/.git": dotGit,
      "wt/app.js": "// worktree",
      "app.js": "// app",
    });

    const directory = await Directory.init(dir);

    expect(await walk(directory)).toEqual(["app.js"]);
    expect(Object.keys(await directory.hashes())).toEqual(["app.js"]);
    expect(directory.nestedWorktreeRoots()).toEqual(new Set(["wt/"]));
  });

  it("doesn't ignore the synced directory when it is a worktree itself", async () => {
    const dir = testDirPath("app");
    const { dotGit } = await makeWorktreeGitDir(dir);
    await writeDir(dir, {
      ".git": dotGit,
      "app.js": "// app",
    });

    const directory = await Directory.init(dir);

    expect(directory.ignores("app.js", false)).toBe(false);
    expect(await walk(directory)).toEqual(["app.js"]);
  });

  it("doesn't ignore nested full clones, submodules, or separate git directories", async () => {
    const dir = testDirPath("app");
    await fs.outputFile(testDirPath("srv", "worktrees", "project", "HEAD"), "ref: refs/heads/main\n");
    await writeDir(dir, {
      ".git/modules/submodule/HEAD": "ref: refs/heads/main\n",
      "clone/.git/HEAD": "ref: refs/heads/main\n",
      "clone/lib.js": "// clone",
      "project/.git": `gitdir: ${testDirPath("srv", "worktrees", "project")}\n`,
      "project/lib.js": "// project",
      "submodule/.git": "gitdir: ../.git/modules/submodule\n",
      "submodule/lib.js": "// submodule",
    });

    const directory = await Directory.init(dir);

    expect(await walk(directory)).toEqual(["clone/", "clone/lib.js", "project/", "project/lib.js", "submodule/", "submodule/lib.js"]);
    expect(directory.nestedWorktreeRoots().size).toBe(0);
  });

  it("keeps ignoring a worktree while git removes it", async () => {
    const dir = testDirPath("app");
    const { dotGit, gitDir } = await makeWorktreeGitDir(path.join(dir, "wt"));
    await writeDir(dir, {
      "wt/.git": dotGit,
      "wt/src/a.js": "// a",
      "wt/src/b.js": "// b",
      "app.js": "// app",
    });

    const directory = await Directory.init(dir);
    expect(directory.ignores("wt/src/a.js", false)).toBe(true);

    // `git worktree remove` can delete the .git file before the other
    // files, and deletes the worktree's git directory last
    await fs.remove(path.join(dir, "wt/.git"));
    await fs.remove(path.join(dir, "wt/src/a.js"));

    expect(directory.ignores("wt/", true)).toBe(true);
    expect(directory.ignores("wt/src/a.js", false)).toBe(true);
    expect(directory.ignores("wt/src/b.js", false)).toBe(true);
    expect(Object.keys(await directory.hashes())).toEqual(["app.js"]);

    await fs.remove(path.join(dir, "wt"));
    await fs.remove(gitDir);

    // a late delete event from the removal
    expect(directory.ignores("wt/src/b.js", false)).toBe(true);
  });

  it("stops ignoring a former worktree once it's replaced with a regular directory", async () => {
    const dir = testDirPath("app");
    const { dotGit, gitDir } = await makeWorktreeGitDir(path.join(dir, "wt"));
    await writeDir(dir, {
      "wt/.git": dotGit,
      "wt/a.js": "// a",
    });

    const directory = await Directory.init(dir);
    expect(directory.ignores("wt/a.js", false)).toBe(true);

    await fs.remove(path.join(dir, "wt"));
    await fs.remove(gitDir);
    await fs.outputFile(path.join(dir, "wt/new.js"), "// new");

    expect(directory.ignores("wt/new.js", false)).toBe(false);
    expect(directory.nestedWorktreeRoots().size).toBe(0);
  });

  it("forgets removed worktrees when hashing", async () => {
    const dir = testDirPath("app");
    const { dotGit } = await makeWorktreeGitDir(path.join(dir, "wt"));
    await writeDir(dir, {
      "wt/.git": dotGit,
      "wt/a.js": "// a",
      "app.js": "// app",
    });

    const directory = await Directory.init(dir);
    await directory.hashes();
    expect(directory.nestedWorktreeRoots()).toEqual(new Set(["wt/"]));

    // deleted with rm -rf, so git still has its git directory until
    // `git worktree prune`
    await fs.remove(path.join(dir, "wt"));

    await directory.hashes();
    expect(directory.nestedWorktreeRoots().size).toBe(0);
  });

  it("detects a worktree created after the directory was initialized", async () => {
    const dir = testDirPath("app");
    await writeDir(dir, { "app.js": "// app" });

    const directory = await Directory.init(dir);
    expect(directory.ignores("wt/a.js", false)).toBe(false);

    const { dotGit } = await makeWorktreeGitDir(path.join(dir, "wt"));
    await writeDir(dir, {
      "wt/.git": dotGit,
      "wt/a.js": "// a",
    });

    expect(directory.ignores("wt/a.js", false)).toBe(true);
  });

  it("reports whether a path is inside a nested worktree without consulting .ignore", async () => {
    const dir = testDirPath("app");
    const { dotGit } = await makeWorktreeGitDir(path.join(dir, "wt"));
    await writeDir(dir, {
      ".ignore": "tmp/",
      "wt/.git": dotGit,
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
