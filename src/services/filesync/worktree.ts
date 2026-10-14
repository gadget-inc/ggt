import path from "node:path";

import fs from "fs-extra";

/**
 * Matches the `gitdir:` line of a `.git` file.
 */
const GITDIR_LINE = /^gitdir:\s*(.+?)\s*$/m;

/**
 * Matches a gitdir that belongs to a linked worktree. Linked worktrees
 * keep their git metadata in `<common git dir>/worktrees/<name>`, so
 * `worktrees` must be the parent of the last segment. This rules out
 * submodules (`.git/modules/<name>`), including submodules checked out
 * inside a linked worktree (`.git/worktrees/<wt>/modules/<name>`).
 */
const LINKED_WORKTREE_GITDIR = /(?:^|[\\/])worktrees[\\/][^\\/]+[\\/]?$/;

/**
 * Returns true if the directory at the given absolute path is the root
 * of a linked git worktree (one created by `git worktree add`).
 *
 * A linked worktree's `.git` is a file rather than a directory, and its
 * `gitdir:` line points into the main repository's `worktrees/` folder.
 * Nested full clones (`.git` is a directory) and submodules (`gitdir:`
 * points into `modules/`) are not linked worktrees.
 *
 * @param absoluteDir - The absolute path to the directory to check.
 */
export const isLinkedWorktreeRoot = (absoluteDir: string): boolean => {
  const dotGit = path.join(absoluteDir, ".git");

  try {
    const stats = fs.statSync(dotGit, { throwIfNoEntry: false });
    if (!stats?.isFile()) {
      return false;
    }

    const gitdir = GITDIR_LINE.exec(fs.readFileSync(dotGit, "utf8"))?.[1];
    return !!gitdir && LINKED_WORKTREE_GITDIR.test(gitdir);
  } catch {
    // ENOTDIR, EACCES, etc. mean this isn't a worktree we can see into
    return false;
  }
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
   * Normalized paths (with a trailing slash) of the worktree roots seen
   * so far.
   *
   * A root stays here after its `.git` file disappears so that the
   * delete events from `git worktree remove` are still recognized as
   * belonging to a worktree.
   */
  private _roots = new Set<string>();

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
    return this._roots;
  }

  /**
   * Forgets every worktree root seen so far and caches which directories
   * aren't roots until {@linkcode endScan} is called. Use this around a
   * full walk of the directory.
   */
  startScan(): void {
    this._roots.clear();
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

      if (this._roots.has(candidate)) {
        if (isLinkedWorktreeRoot(absoluteCandidate)) {
          return true;
        }

        if (!fs.existsSync(path.join(this.root, normalizedPath))) {
          // the worktree is being removed and this path is already
          // gone, so it's a delete event from the removal
          return true;
        }

        // the worktree was replaced with a regular directory
        this._roots.delete(candidate);
        continue;
      }

      if (this._scannedNonRoots?.has(candidate)) {
        continue;
      }

      if (isLinkedWorktreeRoot(absoluteCandidate)) {
        this._roots.add(candidate);
        return true;
      }

      this._scannedNonRoots?.add(candidate);
    }

    return false;
  }
}
