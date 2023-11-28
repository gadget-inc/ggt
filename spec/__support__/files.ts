import fs, { type Stats } from "fs-extra";
import assert from "node:assert";
import path from "node:path";
import normalizePath from "normalize-path";
import { expect } from "vitest";

export type Files = Record<string, string>;

export const writeDir = async (dir: string, files: Files): Promise<void> => {
  await fs.ensureDir(dir);

  for (const [filepath, content] of Object.entries(files)) {
    if (filepath.endsWith("/")) {
      await fs.ensureDir(path.join(dir, filepath));
    } else {
      await fs.outputFile(path.join(dir, filepath), content);
    }
  }
};

// eslint-disable-next-line func-style
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

export const expectDir = async (dir: string, expected: Record<string, string>): Promise<void> => {
  const actual = await readDir(dir);
  expect(actual).toEqual(expected);
};
