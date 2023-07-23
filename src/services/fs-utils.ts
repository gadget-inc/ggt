import fs from "fs-extra";
import type { Ignore } from "ignore";
import ignore from "ignore";
import path from "path";
import { addBreadcrumb } from "./context.js";

export class FSIgnorer {
  readonly filepath;

  private _ignorer!: Ignore;

  constructor(
    private readonly _rootDir: string,
    private readonly _alwaysIgnore: string[],
  ) {
    this.filepath = path.join(this._rootDir, ".ignore");
    this.reload();
  }

  ignores(filepath: string): boolean {
    const relative = path.isAbsolute(filepath) ? path.relative(this._rootDir, filepath) : filepath;
    if (relative == "") return false;
    // anything above the root dir is ignored
    if (relative == "..") {
      return true;
    }
    return this._ignorer.ignores(relative);
  }

  reload(): void {
    this._ignorer = ignore.default();
    this._ignorer.add(this._alwaysIgnore);

    try {
      this._ignorer.add(fs.readFileSync(this.filepath, "utf-8"));
      addBreadcrumb({
        type: "debug",
        category: "fs",
        message: "Reloaded ignore rules",
        data: {
          path: path.relative(this._rootDir, this.filepath),
        },
      });
    } catch (error) {
      ignoreEnoent(error);
    }
  }
}

export interface WalkDirOptions {
  ignorer?: FSIgnorer;
}

export async function* walkDir(dir: string, options: WalkDirOptions = {}): AsyncGenerator<string> {
  if (options.ignorer?.ignores(dir)) return;

  if (await isEmptyDir(dir)) {
    yield `${dir}/`;
    return;
  }

  for await (const entry of await fs.opendir(dir)) {
    const filepath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(filepath, options);
    } else if (entry.isFile() && !options.ignorer?.ignores(filepath)) {
      yield filepath;
    }
  }
}

export function* walkDirSync(dir: string, options: WalkDirOptions = {}): Generator<string> {
  if (options.ignorer?.ignores(dir)) return;

  if (isEmptyDirSync(dir)) {
    yield `${dir}/`;
    return;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filepath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDirSync(filepath, options);
    } else if (entry.isFile() && !options.ignorer?.ignores(filepath)) {
      yield filepath;
    }
  }
}

export function isEmptyDirSync(dir: string, opts = { ignoreEnoent: true }): boolean {
  try {
    const files = fs.readdirSync(dir);
    return files.length === 0;
  } catch (error) {
    if (opts.ignoreEnoent) {
      ignoreEnoent(error);
      return true;
    }
    throw error;
  }
}

export async function isEmptyDir(dir: string, opts = { ignoreEnoent: true }): Promise<boolean> {
  try {
    const files = await fs.readdir(dir);
    return files.length === 0;
  } catch (error) {
    if (opts.ignoreEnoent) {
      ignoreEnoent(error);
      return true;
    }
    throw error;
  }
}

export function ignoreEnoent(error: any): void {
  if (error.code === "ENOENT") {
    addBreadcrumb({
      type: "debug",
      category: "fs",
      message: "Ignoring ENOENT error",
      data: {
        path: path.basename(error.path as string),
      },
    });
    return;
  }
  throw error;
}
