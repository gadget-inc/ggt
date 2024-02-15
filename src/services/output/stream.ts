import process from "node:process";
import { env } from "../config/env.js";
import { isObject } from "../util/is.js";

/**
 * A wrapper around process.stdout and process.stderr that allows us to mock out the streams for testing.
 *
 * @see https://github.com/oclif/core/blob/16139fe8a7f991b4b446a1599ab63f15d9809b8e/src/cli-ux/stream.ts
 */
export class Stream {
  /**
   * Indicates whether the last line that was written was empty. This is
   * used to prevent writing more than one empty line in a row.
   */
  private _lastLineWasEmpty = true;

  public constructor(public channel: "stdout" | "stderr") {
    process[this.channel].on("error", (err: unknown) => {
      if (isObject(err) && "code" in err && err.code === "EPIPE") {
        return;
      }
      throw err;
    });
  }

  public get isTTY(): boolean {
    return process[this.channel].isTTY;
  }

  public getWindowSize(): number[] {
    return process[this.channel].getWindowSize();
  }

  public write(str: string): void {
    if (this._lastLineWasEmpty) {
      // don't ever write more than one empty line in a row
      while (str.startsWith("\n")) {
        str = str.slice(1);
      }
    }

    this._lastLineWasEmpty = str.endsWith("\n\n");
    this._write(str);
  }

  public on(event: string, listener: (...args: unknown[]) => void): this {
    process[this.channel].on(event, listener);
    return this;
  }

  public once(event: string, listener: (...args: unknown[]) => void): this {
    process[this.channel].once(event, listener);
    return this;
  }

  _write(data: string): boolean {
    if (env.testLike) {
      // use console.log/error in tests since vitest doesn't display
      // process.stdout/stderr correctly; also, remove trailing newline
      // since console.log/error adds one.
      data = data.replace(/\n$/, "");
      if (this.channel === "stdout") {
        console.log(data);
      } else {
        console.error(data);
      }
      return true;
    }

    return process[this.channel].write(data);
  }
}

export const stdout = new Stream("stdout");
export const stderr = new Stream("stderr");
