import fs from "fs-extra";
import path from "path";
import type { Ignorer } from "./ignorer";

export interface WalkDirOptions {
  ignorer?: Ignorer;
  maxFiles?: number;
  fileCount?: number;
}

export async function* walkDir(dir: string, options: WalkDirOptions = {}): AsyncGenerator<string> {
  if (options.ignorer?.ignores(dir)) return;
  if (options.fileCount == null) options.fileCount = 0;

  for await (const entry of await fs.opendir(dir)) {
    const filepath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(filepath, options);
    } else if (entry.isFile() && !options.ignorer?.ignores(filepath)) {
      if (options.maxFiles != null && ++options.fileCount >= options.maxFiles) {
        throw new WalkedTooManyFilesError(options.maxFiles);
      }
      yield filepath;
    }
  }
}

export function* walkDirSync(dir: string, options: WalkDirOptions = {}): Generator<string> {
  if (options.ignorer?.ignores(dir)) return;
  if (options.fileCount == null) options.fileCount = 0;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filepath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDirSync(filepath, options);
    } else if (entry.isFile() && !options.ignorer?.ignores(filepath)) {
      if (options.maxFiles != null && ++options.fileCount >= options.maxFiles) {
        throw new WalkedTooManyFilesError(options.maxFiles);
      }
      yield filepath;
    }
  }
}

// eslint-disable-next-line jsdoc/require-jsdoc
export class WalkedTooManyFilesError extends Error {
  constructor(readonly maxFiles: number) {
    super(`Walked too many files (${maxFiles}).`);
    this.name = "WalkedTooManyFilesError";
  }
}
