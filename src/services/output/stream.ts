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

  constructor(public channel: "stdout" | "stderr") {
    process[this.channel].on("error", (err: unknown) => {
      if (isObject(err) && "code" in err && err.code === "EPIPE") {
        return;
      }
      throw err;
    });
  }

  get isTTY(): boolean {
    return process[this.channel].isTTY;
  }

  getWindowSize(): number[] {
    return process[this.channel].getWindowSize();
  }

  write(str: string): void {
    // remove duplicate empty lines
    while (str.startsWith("\n\n")) {
      str = str.slice(0, -1);
    }

    while (str.endsWith("\n\n")) {
      str = str.slice(0, -1);
    }

    str = str.replaceAll(/\n\n+/g, "\n\n");

    if (this._lastLineWasEmpty) {
      // we just printed an empty line, so don't print another one
      while (str.startsWith("\n")) {
        str = str.slice(1);
      }
    }

    if (str === "") {
      // nothing to print
      return;
    }

    // remember if the last line was empty
    this._lastLineWasEmpty = str === "\n";

    this._write(str);
  }

  on(event: string, listener: (...args: unknown[]) => void): this {
    process[this.channel].on(event, listener);
    return this;
  }

  once(event: string, listener: (...args: unknown[]) => void): this {
    process[this.channel].once(event, listener);
    return this;
  }

  private _write(data: string): boolean {
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
