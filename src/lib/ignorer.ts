import fs from "fs-extra";
import type { Ignore } from "ignore";
import ignore from "ignore";
import path from "path";
import { ignoreEnoent } from "./enoent";
import { logger } from "./logger";

export class Ignorer {
  readonly filepath = path.join(this._rootDir, ".ignore");

  private _ignorer!: Ignore;

  constructor(private readonly _rootDir: string, private readonly _alwaysIgnore: string[]) {
    this.reload();
  }

  ignores(filepath: string): boolean {
    const relative = path.relative(this._rootDir, filepath);
    if (relative == "") return false;
    return this._ignorer.ignores(relative);
  }

  reload(): void {
    this._ignorer = ignore();
    this._ignorer.add(this._alwaysIgnore);

    try {
      this._ignorer.add(fs.readFileSync(this.filepath, "utf-8"));
    } catch (error) {
      ignoreEnoent(error);
    }

    logger.trace({ path: this.filepath }, "🔄 reloaded ignore rules");
  }
}
