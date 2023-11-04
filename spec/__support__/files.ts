import fs, { type Stats } from "fs-extra";
import path from "node:path";
import normalizePath from "normalize-path";
import { assert, expect } from "vitest";

export type Files = Record<string, string>;

export const readFiles = async (dir: string): Promise<Files> => {
  const files = {} as Files;

  for await (const { absolutePath, stats } of walkDir(dir)) {
    const filepath = normalizePath(path.relative(dir, absolutePath));
    if (stats.isDirectory()) {
      files[filepath + "/"] = "";
    } else if (stats.isFile()) {
      files[filepath] = await fs.readFile(absolutePath, { encoding: "utf8" });
    }
  }

  return files;
};

export const writeFiles = async (dir: string, files: Files): Promise<Files> => {
  await fs.ensureDir(dir);

  for (const [filepath, content] of Object.entries(files)) {
    if (filepath.endsWith("/")) {
      await fs.ensureDir(path.join(dir, filepath));
    } else {
      await fs.outputFile(path.join(dir, filepath), content);
    }
  }

  return files;
};

export const expectFiles = async (dir: string, files: Files): Promise<void> => {
  const expected = {} as Files;
  for (const [filepath, content] of Object.entries(files)) {
    if (filepath.endsWith("/")) {
      expected[filepath] = "";
    }
    expected[filepath] = Buffer.from(content).toString("base64");
  }

  const actual = await readFiles(dir);
  expect(actual).toEqual(expected);
};

// eslint-disable-next-line func-style
async function* walkDir(dir: string, root = dir): AsyncGenerator<{ absolutePath: string; stats: Stats }> {
  const stats = await fs.stat(dir);
  assert(stats.isDirectory(), `expected ${dir} to be a directory`);

  if (dir !== root) {
    // don't yield the root directory
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
