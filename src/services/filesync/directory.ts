import type { Stats } from "fs-extra";
import fs from "fs-extra";
import type { Ignore } from "ignore";
import ignore from "ignore";
import assert from "node:assert";
import { createHash } from "node:crypto";
import path from "node:path";
import normalizePath from "normalize-path";

const ALWAYS_IGNORE_PATHS = [".DS_Store", "node_modules", ".git"] as const;

export class Directory {
  /**
   * The {@linkcode Ignore} instance that is used to determine if a file
   * should be ignored.
   *
   * @see https://www.npmjs.com/package/ignore
   */
  private _ignorer!: Ignore;

  constructor(
    /**
     * An absolute path to the directory that is being synced.
     */
    readonly path: string,

    /**
     * Whether the directory was empty when it was initialized.
     */
    readonly wasEmpty: boolean,

    /**
     * Additional paths to ignore when syncing the filesystem.
     */
    private _extraIgnorePaths: string[] = [],
  ) {
    this.reloadIgnorePaths();
  }

  /**
   * Converts an absolute path into a relative one from {@linkcode path}.
   */
  relative(to: string): string {
    if (!path.isAbsolute(to)) {
      // the filepath is already relative
      return to;
    }

    return path.relative(this.path, to);
  }

  /**
   * Converts a relative path into an absolute one from {@linkcode path}.
   */
  absolute(...pathSegments: string[]): string {
    return path.resolve(this.path, ...pathSegments);
  }

  /**
   * Similar to {@linkcode relative} in that it converts an absolute
   * path into a relative one from {@linkcode path}. However, it also
   * changes any slashes to be posix/unix-like forward slashes,
   * condenses repeated slashes into a single slash, and adds a trailing
   * slash if the path is a directory.
   *
   * This is used when sending file-sync events to Gadget to ensure that
   * the paths are consistent across platforms.
   *
   * @see https://www.npmjs.com/package/normalize-path
   */
  normalize(filepath: string, isDirectory: boolean): string {
    if (path.isAbsolute(filepath)) {
      filepath = this.relative(filepath);
    }

    filepath = normalizePath(filepath);

    if (isDirectory) {
      filepath += "/";
    }

    return filepath;
  }

  /**
   * Reloads the ignore rules from the `.ignore` file.
   */
  reloadIgnorePaths(overrideExtraIgnorePaths?: string[]): void {
    this._ignorer = ignore.default();
    this._ignorer.add([...ALWAYS_IGNORE_PATHS, ...(overrideExtraIgnorePaths ?? this._extraIgnorePaths)]);

    try {
      const content = fs.readFileSync(this.absolute(".ignore"), "utf-8");
      this._ignorer.add(content);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return;
      }
    }
  }

  /**
   * Returns `true` if the {@linkcode filepath} should be ignored.
   */
  ignores(filepath: string): boolean {
    const relative = this.relative(filepath);
    if (relative === "") {
      // don't ignore the root dir
      return false;
    }

    if (relative.startsWith("..")) {
      // anything above the root dir is ignored
      return true;
    }

    return this._ignorer.ignores(relative);
  }

  /**
   * Walks this directory and yields each file and directory within it.
   */
  async *walk({ dir = this.path, skipIgnored = true } = {}): AsyncGenerator<{ normalizedPath: string; stats: Stats }> {
    const stats = await fs.stat(dir);
    assert(stats.isDirectory(), `expected ${dir} to be a directory`);

    yield { normalizedPath: this.normalize(dir, true), stats };

    for await (const entry of await fs.opendir(dir)) {
      const filepath = path.join(dir, entry.name);
      if (skipIgnored && this.ignores(filepath)) {
        continue;
      }

      if (entry.isDirectory()) {
        yield* this.walk({ dir: filepath, skipIgnored });
      } else if (entry.isFile()) {
        yield { normalizedPath: this.normalize(filepath, false), stats: await fs.stat(filepath) };
      }
    }
  }

  async hashes(): Promise<Hashes> {
    try {
      // these ignore paths are allowed to be different between ggt and gadget
      this.reloadIgnorePaths([".gadget/sync.json", ".gadget/backup"]);
      const files = {} as Hashes;

      for await (const { normalizedPath, stats } of this.walk()) {
        const filepath = this.absolute(normalizedPath);
        switch (true) {
          case stats.isFile():
            files[normalizedPath] = await hash(filepath);
            break;
          case stats.isDirectory():
            files[normalizedPath] = "0";
            break;
        }
      }

      return files;
    } finally {
      this.reloadIgnorePaths();
    }
  }
}

/**
 * Key/value pairs where the key is the
 * {@linkcode Directory#normalizePath} path and the value is the result
 * of {@linkcode hash} for that path.
 */
export type Hashes = Record<string, string>;

const hash = (filepath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const stream = fs.createReadStream(filepath).map((data: Uint8Array) => {
        // windows uses CRLF line endings whereas unix uses LF line
        // endings so we always strip out CR bytes (0x0d) when hashing
        // files. this does make us blind to files that only differ by
        // CR bytes, but that's a tradeoff we're willing to make.
        return data.filter((byte) => byte !== 0x0d);
      });

      const hash = createHash("sha1");
      stream.on("error", (err) => reject(err));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.pipe(hash, { end: false });
    } catch (error) {
      reject(error);
    }
  });
};
