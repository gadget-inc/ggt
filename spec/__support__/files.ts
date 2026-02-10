import fs, { type Stats } from "fs-extra";
import assert from "node:assert";
import path from "node:path";
import normalizePath from "normalize-path";
import { expect } from "vitest";

import { Directory } from "../../src/services/filesync/directory.js";

/**
 * A map of file paths to file contents.
 */
export type Files = Record<string, string>;

/**
 * Writes a directory with the specified files.
 *
 * @param dir - The directory path to write.
 * @param files - An object containing file paths as keys and file contents as values.
 * @returns A promise that resolves when the directory and files have been written successfully.
 */
export const writeDir = async (dir: string | Directory, files: Files): Promise<void> => {
  if (dir instanceof Directory) {
    dir = dir.path;
  }

  await fs.ensureDir(dir);

  for (const [filepath, content] of Object.entries(files)) {
    if (filepath.endsWith("/")) {
      await fs.ensureDir(path.join(dir, filepath));
    } else {
      await fs.outputFile(path.join(dir, filepath), content);
    }
  }
};

/**
 * Reads the contents of a directory and returns a map of file paths to
 * their contents. If a directory is encountered, an empty string is
 * assigned as the value for that directory path.
 *
 * @param dir - The directory path to read.
 * @returns A promise that resolves to a map of file paths to their
 * contents.
 */
export const readDir = async (dir: string): Promise<Files> => {
  const files = {} as Files;

  for await (const { absolutePath, stats } of walkDir(dir)) {
    const filepath = normalizePath(path.relative(dir, absolutePath));
    if (stats.isDirectory()) {
      files[filepath + "/"] = "";
      continue;
    }

    assert(stats.isFile(), `expected ${absolutePath} to be a file`);
    files[filepath] = await fs.readFile(absolutePath, { encoding: "utf8" });
  }

  return files;
};

/**
 * Asserts that the contents of a directory match the expected contents.
 *
 * @param dir - The path to the directory.
 * @param expected - An object representing the expected contents of the
 * directory, where the keys are file names and the values are file
 * contents.
 * @returns A promise that resolves when the assertion is complete.
 */
export const expectDir = async (dir: string | Directory, expected: Record<string, string>): Promise<void> => {
  if (dir instanceof Directory) {
    dir = dir.path;
  }

  const actual = await readDir(dir);
  expect(actual).toEqual(expected);
};

// oxlint-disable-next-line func-style
async function* walkDir(dir: string, root = dir): AsyncGenerator<{ absolutePath: string; stats: Stats }> {
  const stats = await fs.stat(dir);
  assert(stats.isDirectory(), `expected ${dir} to be a directory`);

  // don't yield the root directory
  if (dir !== root) {
    yield { absolutePath: dir, stats };
  }

  for await (const entry of await fs.opendir(dir)) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(absolutePath, root);
    } else if (entry.isFile()) {
      yield { absolutePath, stats: await fs.stat(absolutePath) };
    }
  }
}
