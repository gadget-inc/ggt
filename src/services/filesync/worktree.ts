import path from "node:path";

import fs from "fs-extra";

/**
 * Matches the `gitdir:` line of a `.git` file.
 */
const GITDIR_LINE = /^gitdir:\s*(.+?)\s*$/m;

/**
 * Returns the absolute path to the git directory of the linked worktree
 * rooted at the given directory, or undefined if it isn't the root of a
 * linked worktree (one created by `git worktree add`).
 *
 * A linked worktree's `.git` is a file whose `gitdir:` line points at
 * the worktree's admin directory inside the main repository
 * (`.git/worktrees/<name>`), and only an admin directory contains a
 * `commondir` file. Nested full clones (`.git` is a directory),
 * submodules, and repositories made with `git init --separate-git-dir`
 * (whose git directories have no `commondir`) are not linked worktrees.
 *
 * @param absoluteDir - The absolute path to the directory to check.
 */
export const linkedWorktreeGitDir = (absoluteDir: string): string | undefined => {
  const dotGit = path.join(absoluteDir, ".git");

  try {
    const stats = fs.statSync(dotGit, { throwIfNoEntry: false });
    if (!stats?.isFile()) {
      return undefined;
    }

    const gitdir = GITDIR_LINE.exec(fs.readFileSync(dotGit, "utf8"))?.[1];
    if (!gitdir) {
      return undefined;
    }

    const absoluteGitDir = path.resolve(absoluteDir, gitdir);
    if (!fs.statSync(path.join(absoluteGitDir, "commondir"), { throwIfNoEntry: false })?.isFile()) {
      return undefined;
    }

    return absoluteGitDir;
  } catch {
    // ENOTDIR, EACCES, etc. mean this isn't a worktree we can see into
    return undefined;
  }
};

/**
 * Returns true if the directory at the given absolute path is the root
 * of a linked git worktree. See {@linkcode linkedWorktreeGitDir}.
 *
 * @param absoluteDir - The absolute path to the directory to check.
 */
export const isLinkedWorktreeRoot = (absoluteDir: string): boolean => {
  return linkedWorktreeGitDir(absoluteDir) !== undefined;
};

/**
 * Tracks linked git worktrees nested inside a synced directory so their
 * files are never synced.
 *
 * Tools like Claude Code, Cursor, Conductor, and Codex create worktrees
 * inside the project folder. Each one is a full copy of the app, so
 * syncing it would push every file a second (or tenth) time. Worktrees
 * are detected by what they are rather than where tools put them, so
 * this doesn't need a list of tool folders.
 */
export class NestedWorktrees {
  /**
   * The absolute path to the synced directory.
   */
  readonly root: string;

  /**
   * The worktree roots seen so far, keyed by their normalized path (with
   * a trailing slash), with the absolute path to each one's git
   * directory.
   *
   * `git worktree remove` can delete a worktree's `.git` file before
   * its other files, but it deletes the git directory last. A root stays
   * here while its git directory exists so the rest of the removal is
   * still recognized as belonging to a worktree.
   */
  private _roots = new Map<string, string>();

  /**
   * Directories known not to be worktree roots. Only kept during a
   * {@linkcode startScan} so a walk checks each directory once instead
   * of once per file beneath it.
   */
  private _scannedNonRoots?: Set<string>;

  constructor(root: string) {
    this.root = root;
  }

  /**
   * The normalized paths of the worktree roots seen so far.
   */
  get roots(): ReadonlySet<string> {
    return new Set(this._roots.keys());
  }

  /**
   * Forgets worktree roots that are gone and caches which directories
   * aren't roots until {@linkcode endScan} is called. Use this around a
   * full walk of the directory.
   *
   * A root that's still on disk with its git directory intact is kept,
   * because it's either still a worktree or in the middle of being
   * removed.
   */
  startScan(): void {
    for (const [root, gitDir] of this._roots) {
      if (!fs.existsSync(path.join(this.root, root)) || !fs.existsSync(gitDir)) {
        this._roots.delete(root);
      }
    }
    this._scannedNonRoots = new Set();
  }

  /**
   * Stops caching which directories aren't roots, so a worktree created
   * later is noticed.
   */
  endScan(): void {
    this._scannedNonRoots = undefined;
  }

  /**
   * Returns true if the given path is a nested worktree root or is
   * inside one. The synced directory itself is never considered a
   * nested worktree, so running ggt from inside a worktree still works.
   *
   * @param normalizedPath - A path relative to {@linkcode root} using
   * forward slashes.
   * @param isDirectory - Whether the path is a directory. If it is, the
   * path itself is checked in addition to its ancestors.
   */
  contains(normalizedPath: string, isDirectory: boolean): boolean {
    const segments = normalizedPath.split("/").filter(Boolean);
    const depth = isDirectory ? segments.length : segments.length - 1;

    for (let i = 1; i <= depth; i++) {
      const candidate = `${segments.slice(0, i).join("/")}/`;
      const absoluteCandidate = path.join(this.root, candidate);

      const knownGitDir = this._roots.get(candidate);
      if (knownGitDir) {
        if (isLinkedWorktreeRoot(absoluteCandidate) || fs.existsSync(knownGitDir)) {
          // still a worktree, or git is still removing it
          return true;
        }

        if (!fs.existsSync(path.join(this.root, normalizedPath))) {
          // the removal finished and this is a late delete event from it
          return true;
        }

        // the worktree was replaced with a regular directory
        this._roots.delete(candidate);
        continue;
      }

      // only cache answers about ancestors. `git worktree add` creates
      // the directory before its .git file and git directory, so a walk
      // can check the directory itself too early. it checks out files
      // only after both exist, so a check made for a file inside the
      // directory is never too early
      const isAncestor = i < segments.length;

      if (isAncestor && this._scannedNonRoots?.has(candidate)) {
        continue;
      }

      const gitDir = linkedWorktreeGitDir(absoluteCandidate);
      if (gitDir) {
        this._roots.set(candidate, gitDir);
        return true;
      }

      if (isAncestor) {
        this._scannedNonRoots?.add(candidate);
      }
    }

    return false;
  }
}
