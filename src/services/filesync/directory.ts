import fs from "fs-extra";
import type { Ignore } from "ignore";
import ignore from "ignore";
import assert from "node:assert";
import { createHash } from "node:crypto";
import path from "node:path";
import normalizePath from "normalize-path";

/**
 * Paths that are always ignored, regardless of the contents of the `.ignore` file.
 */
export const ALWAYS_IGNORE_PATHS = [".DS_Store", "node_modules", ".git"] as const;

/**
 * Paths that are ignored when hashing the directory.
 *
 * NOTE: This is the _only_ thing that is allowed to be different between gadget and ggt.
 */
export const HASHING_IGNORE_PATHS = [".gadget/sync.json", ".gadget/backup"] as const;

/**
 * Represents a directory that is being synced.
 */
export class Directory {
  /**
   * A gitignore-style file parser used to determine which files to ignore while syncing.
   *
   * @see https://www.npmjs.com/package/ignore
   */
  private _ignorer!: Ignore;

  /**
   * Whether the directory is currently being hashed.
   */
  private _isHashing = false;

  // TODO: make private
  constructor(
    /**
     * An absolute path to the directory that is being synced.
     */
    readonly path: string,

    /**
     * Whether the directory was empty when it was initialized.
     */
    readonly wasEmpty: boolean,
  ) {
    this.loadIgnoreFile();
  }

  /**
   * Initializes a directory.
   *
   * If the directory does not exist, it is created.
   *
   * @param dir - The directory to initialize.
   * @returns A Promise that resolves to a Directory instance.
   */
  static async init(dir: string): Promise<Directory> {
    try {
      const stats = await fs.stat(dir);
      assert(stats.isDirectory(), `expected ${dir} to be a directory`);

      await fs.ensureDir(dir);
      return new Directory(dir, false);
    } catch (error) {
      swallowEnoent(error);
      return new Directory(dir, true);
    }
  }

  /**
   * Returns the relative path from this directory to the specified path.
   *
   * @param to - The path to which the relative path is calculated.
   * @returns The relative path from this directory to the specified path.
   */
  relative(to: string): string {
    if (!path.isAbsolute(to)) {
      // the filepath is already relative
      return to;
    }

    return path.relative(this.path, to);
  }

  /**
   * Returns the absolute path by resolving the given path segments
   * relative to the directory path.
   *
   * @param pathSegments The path segments to resolve.
   * @returns The absolute path.
   */
  absolute(...pathSegments: string[]): string {
    const result = path.resolve(this.path, ...pathSegments);
    assert(result.startsWith(this.path), `expected ${result} to be within ${this.path}`);
    return result;
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
    filepath = normalizePath(filepath);

    if (path.isAbsolute(filepath)) {
      filepath = this.relative(filepath);
    }

    if (isDirectory) {
      filepath += "/";
    }

    return filepath;
  }

  /**
   * Loads the ignore file from the `.ignore` file in the directory. If
   * the file does not exist, it is silently ignored.
   */
  loadIgnoreFile(): void {
    this._ignorer = ignore.default();
    this._ignorer.add(ALWAYS_IGNORE_PATHS);

    try {
      const content = fs.readFileSync(this.absolute(".ignore"), "utf-8");
      this._ignorer.add(content);
    } catch (error) {
      swallowEnoent(error);
    }
  }

  /**
   * Determines if a file should be ignored based on its filepath.
   *
   * @param filepath - The filepath of the file to check.
   * @returns True if the file should be ignored, false otherwise.
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

    if (this._isHashing && HASHING_IGNORE_PATHS.some((ignored) => relative.startsWith(ignored))) {
      // special case for hashing
      return true;
    }

    return this._ignorer.ignores(relative);
  }

  /**
   * Recursively walks through the directory and yields all files and
   * directories within it.
   *
   * @yields - The normalized path of each file and directory.
   */
  async *walk({ dir = this.path } = {}): AsyncGenerator<string> {
    const stats = await fs.stat(dir);
    assert(stats.isDirectory(), `expected ${dir} to be a directory`);

    if (dir !== this.path) {
      // don't yield the root directory
      yield this.normalize(dir, true);
    }

    for await (const entry of await fs.opendir(dir)) {
      const filepath = path.join(dir, entry.name);
      if (this.ignores(filepath)) {
        continue;
      }

      if (entry.isDirectory()) {
        yield* this.walk({ dir: filepath });
      } else if (entry.isFile()) {
        yield this.normalize(filepath, false);
      }
    }
  }

  /**
   * Calculates the hash of each file and directory and returns an
   * object containing the hashes keyed by the normalized file path.
   *
   * @returns A Promise that resolves to an object containing the hashes
   * of each file.
   */
  async hashes(): Promise<Hashes> {
    try {
      this._isHashing = true;
      const files = {} as Hashes;

      for await (const normalizedPath of this.walk()) {
        const absolutePath = this.absolute(normalizedPath);
        files[normalizedPath] = await hash(absolutePath);
      }

      return files;
    } finally {
      this._isHashing = false;
    }
  }
}

/**
 * Key/value pairs where the key is the normalized path and the value is
 * the result of {@linkcode hash} for that path.
 */
export type Hashes = Record<string, string>;

/**
 * Calculates the SHA-1 hash of the file or directory at the specified
 * absolute path. If the path points to a directory, the hash is
 * calculated based on the directory name. If the path points to a file,
 * the hash is calculated based on the file's name and contents.
 *
 * @param absolutePath The absolute path to the file or directory.
 * @returns A Promise that resolves to the SHA-1 hash of the file or
 * directory.
 */
const hash = async (absolutePath: string): Promise<string> => {
  const sha1 = createHash("sha1");
  sha1.update(path.basename(absolutePath));

  const stats = await fs.stat(absolutePath);
  if (stats.isDirectory()) {
    return sha1.digest("hex");
  }

  return await new Promise((resolve, reject) => {
    try {
      const stream = fs.createReadStream(absolutePath).map((data: Uint8Array) => {
        // windows uses CRLF line endings whereas unix uses LF line
        // endings so we always strip out CR bytes (0x0d) when hashing
        // files. this does make us blind to files that only differ by
        // CR bytes, but that's a tradeoff we're willing to make.
        return data.filter((byte) => byte !== 0x0d);
      });

      stream.on("error", (err) => reject(err));
      stream.on("end", () => resolve(sha1.digest("hex")));
      stream.pipe(sha1, { end: false });
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Swallows ENOENT errors and throws any other errors.
 *
 * @param error - The error to handle.
 * @throws The original error if it is not an ENOENT error.
 */
export const swallowEnoent = (error: unknown): void => {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    return;
  }
  throw error;
};

/**
 * Checks if a directory is empty or non-existent.
 *
 * @param dir - The directory path to check.
 * @returns A Promise that resolves to a boolean indicating whether the directory is empty or non-existent.
 */
export const isEmptyOrNonExistentDir = async (dir: string): Promise<boolean> => {
  try {
    for await (const _ of await fs.opendir(dir, { bufferSize: 1 })) {
      return false;
    }
    return true;
  } catch (error) {
    swallowEnoent(error);
    return true;
  }
};
