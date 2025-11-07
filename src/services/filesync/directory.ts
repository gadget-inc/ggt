/**
 * DO NOT MODIFY
 *
 * Everything in this file also exists in gadget to ensure that this logic
 * is the same between the two projects.
 */
import fs from "fs-extra";
import type { Ignore } from "ignore";
import ignore from "ignore";
import assert from "node:assert";
import { createHash } from "node:crypto";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import normalizePath from "normalize-path";

/**
 * Paths that are never ignored, regardless of the contents of the `.ignore` file.
 */
export const NEVER_IGNORE_PATHS = [".gadget/"] as const;

/**
 * Paths that are always ignored, regardless of the contents of the `.ignore` file.
 */
export const ALWAYS_IGNORE_PATHS = [".DS_Store", "node_modules", ".git", ".shopify"] as const;

/**
 * Paths that are ignored when hashing the directory.
 *
 * NOTE: This is the _only_ thing that is allowed to be different between gadget and ggt.
 */
export const HASHING_IGNORE_PATHS = [".gadget/sync.json", ".gadget/backup", "yarn-error.log"] as const;

/**
 * Represents a directory that is being synced.
 */
export class Directory {
  /**
   * A gitignore-style file parser used to determine which files to
   * ignore while syncing.
   *
   * @see https://www.npmjs.com/package/ignore
   */
  private _ignorer!: Ignore;

  /**
   * Whether the directory is currently being hashed.
   */
  private _isHashing = false;

  private constructor(
    /**
     * An absolute path to the directory that is being synced.
     */
    readonly path: string,
  ) {}

  /**
   * Initializes a directory to be synced.
   *
   * If the directory does not exist, it is created.
   *
   * @param dir - The directory to initialize.
   * @returns A Promise that resolves to a Directory instance.
   */
  static async init(dir: string): Promise<Directory> {
    const directory = new Directory(dir);
    await directory.loadIgnoreFile();
    return directory;
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
   * @param pathSegments - The path segments to resolve.
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
   * This is used when sending files to Gadget to ensure that the paths
   * are consistent across platforms.
   *
   * @see https://www.npmjs.com/package/normalize-path
   */
  normalize(filepath: string, isDirectory: boolean): string {
    if (path.isAbsolute(filepath)) {
      filepath = this.relative(filepath);
    }

    // true = trim trailing slashes
    filepath = normalizePath(filepath, true);

    if (isDirectory) {
      filepath += "/";
    }

    return filepath;
  }

  /**
   * Loads the `.ignore` file in the directory. If the file does not
   * exist, it is silently ignored.
   */
  async loadIgnoreFile(): Promise<void> {
    this._ignorer = ignore();
    this._ignorer.add(ALWAYS_IGNORE_PATHS);

    try {
      const content = await fs.readFile(this.absolute(".ignore"), "utf8");
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
    filepath = this.relative(filepath);
    if (filepath === "") {
      // don't ignore the root dir
      return false;
    }

    if (filepath.startsWith("..")) {
      // anything above the root dir is ignored
      return true;
    }

    // false = don't trim trailing slashes
    filepath = normalizePath(filepath, false);
    if (this._isHashing && HASHING_IGNORE_PATHS.some((ignored) => filepath.startsWith(ignored))) {
      // special case for hashing
      return true;
    }

    if (NEVER_IGNORE_PATHS.some((neverIgnored) => filepath.startsWith(neverIgnored))) {
      // special case for never ignored paths
      return false;
    }

    return this._ignorer.ignores(filepath);
  }

  /**
   * Recursively walks through the directory and yields all non-ignored
   * files and directories within it.
   *
   * @yields - The normalized path of each file and directory.
   */
  async *walk({ dir = this.path } = {}): AsyncGenerator<string> {
    // don't yield the root directory
    if (dir !== this.path) {
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

  async hasFiles(): Promise<boolean> {
    return !(await this.isEmptyOrNonExistent());
  }

  async isEmptyOrNonExistent(): Promise<boolean> {
    let isEmptyOrNonExistent = true;
    try {
      for await (const _ of this.walk()) {
        isEmptyOrNonExistent = false;
        break;
      }
    } catch (error) {
      swallowEnoent(error);
    }
    return isEmptyOrNonExistent;
  }
}

/**
 * Key/value pairs where the key is the normalized path and the value is
 * the result of {@linkcode hash} for that path.
 */
export type Hashes = Record<string, Hash>;

export type Hash = {
  /**
   * The SHA-1 hash of the file or directory.
   *
   * If the path points to a directory, the hash is calculated based on
   * the directory's basename. If the path points to a file, the hash is
   * calculated based on the file's basename and contents.
   */
  sha1: string;

  /**
   * The Unix-style file permissions of the file or directory, or
   * undefined if the platform that generated this hash doesn't support
   * them.
   *
   * @example 0o644
   * @see supportsPermissions
   */
  permissions?: number;
};

/**
 * Whether the current platform supports Unix-style file permissions.
 *
 * Windows doesn't support Unix-style file permissions and all file
 * permissions retrieved via `node:fs` on Windows are translated to 666
 * or 444.
 */
export const supportsPermissions = process.platform === "linux" || process.platform === "darwin";

/**
 * Calculates the {@linkcode Hash} of the file or directory at the
 * specified absolute path.
 *
 * @param absolutePath - The absolute path to the file or directory.
 * @returns A Promise that resolves to the {@linkcode Hash} of the file
 * or directory.
 */
const hash = async (absolutePath: string): Promise<Hash> => {
  const sha1 = createHash("sha1");
  sha1.update(path.basename(absolutePath));

  const stats = await fs.stat(absolutePath);

  let permissions;
  if (supportsPermissions) {
    // strip everything but the permissions
    permissions = stats.mode & 0o777;
  }

  if (stats.isDirectory()) {
    return { sha1: sha1.digest("hex"), permissions };
  }

  // windows uses CRLF line endings whereas unix uses LF line endings so
  // we always strip out CR bytes (0x0d) when hashing files. this does
  // make us blind to files that only differ by CR bytes, but that's a
  // tradeoff we're willing to make.
  const removeCR = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (!chunk.includes(0x0d)) {
        callback(undefined, chunk);
        return;
      }

      const filteredChunk = Buffer.alloc(chunk.length);
      let i = 0;
      for (const byte of chunk) {
        if (byte !== 0x0d) {
          filteredChunk[i++] = byte;
        }
      }

      callback(undefined, filteredChunk.subarray(0, i));
    },
  });

  await pipeline(fs.createReadStream(absolutePath), removeCR, sha1);

  return { sha1: sha1.digest("hex"), permissions };
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
