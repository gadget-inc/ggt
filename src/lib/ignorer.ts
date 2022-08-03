import fs from "fs-extra";
import type { Ignore } from "ignore";
import ignore from "ignore";
import path from "path";
import { ignoreEnoent } from "./enoent";
import { logger } from "./logger";

// eslint-disable-next-line jsdoc/require-jsdoc
export class Ignorer {
  readonly filepath = path.join(this.rootDir, ".ignore");

  private _ignorer!: Ignore;

  constructor(private readonly rootDir: string, private readonly alwaysIgnore: string[]) {
    this.reload();
  }

  ignores(filepath: string): boolean {
    const relative = path.relative(this.rootDir, filepath);
    if (relative == "") return false;
    return this._ignorer.ignores(relative);
  }

  reload(): void {
    this._ignorer = ignore();
    this._ignorer.add(this.alwaysIgnore);

    try {
      this._ignorer.add(fs.readFileSync(this.filepath, "utf-8"));
    } catch (error) {
      ignoreEnoent(error);
    }

    logger.trace({ path: this.filepath }, "🔄 reloaded ignore rules");
  }
}
