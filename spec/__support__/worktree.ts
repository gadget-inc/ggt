import path from "node:path";

import fs from "fs-extra";

import { testDirPath } from "./paths.ts";

/**
 * Creates the git directory that `git worktree add` makes for a linked
 * worktree, inside a repository at `testDirPath("repo")`, without
 * creating the worktree itself.
 *
 * @param worktreeDir - The absolute path where the worktree is checked out.
 * @returns `dotGit`, the contents of the worktree's `.git` file (a
 * relative path, so snapshots are stable), and `gitDir`, the absolute
 * path to the worktree's git directory.
 */
export const makeWorktreeGitDir = async (worktreeDir: string): Promise<{ dotGit: string; gitDir: string }> => {
  const gitDir = testDirPath("repo", ".git", "worktrees", path.basename(worktreeDir));
  await fs.outputFile(path.join(gitDir, "commondir"), "../..\n");
  await fs.outputFile(path.join(gitDir, "gitdir"), `${path.join(worktreeDir, ".git")}\n`);

  const relativeGitDir = path.relative(worktreeDir, gitDir).split(path.sep).join("/");
  return { dotGit: `gitdir: ${relativeGitDir}\n`, gitDir };
};
