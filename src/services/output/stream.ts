import process from "node:process";
import stringWidth from "string-width";
import stripAnsi from "strip-ansi";
import { env } from "../config/env.js";
import { isObject } from "../util/is.js";

/**
 * A wrapper around process.stdout and process.stderr that allows us to mock out the streams for testing.
 *
 * @see https://github.com/oclif/core/blob/16139fe8a7f991b4b446a1599ab63f15d9809b8e/src/cli-ux/stream.ts
 */
export class Stream {
  /**
   * Indicates whether the last line that was written to the stream was
   * empty (i.e. "\n"). This is useful for preventing duplicate empty
   * lines from being printed.
   *
   * This is automatically calculated by the {@linkcode write} method,
   * so you only need to set this property manually when you know
   * something else wrote to the stream directly (e.g. `ora`).
   */
  lastLineWasEmpty = true;

  #stream = process[this.channel];
  #stickyText = "";
  #stickyTextLinesToClear = 0;

  constructor(public channel: "stdout" | "stderr") {
    this.#stream.on("error", (err: unknown) => {
      if (isObject(err) && "code" in err && err.code === "EPIPE") {
        return;
      }
      throw err;
    });
  }

  get isTTY(): boolean {
    return this.#stream.isTTY;
  }

  get stickyText(): string {
    return this.#stickyText;
  }

  getWindowSize(): number[] {
    return this.#stream.getWindowSize();
  }

  write(text: string): void {
    this.clearStickyText();

    text = this._format(text);
    this._write(text);

    // remember if the last line was empty
    this.lastLineWasEmpty = text === "\n";

    const stickyText = this._format(this.#stickyText);
    if (stickyText === "") {
      return;
    }

    this._write(stickyText);
  }

  writeStickyText(text: string): void {
    text = this._format(text);
    if (text !== this.#stickyText) {
      // persist the current sticky text before writing new text
      this.persistStickyText();
    }

    this.#stickyText = text;
    this.write("");
  }

  clearStickyText(): void {
    if (!this.#stream.isTTY || this.#stickyTextLinesToClear === 0) {
      return;
    }

    this.#stream.cursorTo(0);

    for (let i = 0; i < this.#stickyTextLinesToClear; i++) {
      if (i > 0) {
        this.#stream.moveCursor(0, -1);
      }
      this.#stream.clearLine(1);
    }

    this.#stickyTextLinesToClear = 0;
  }

  persistStickyText(): void {
    // we already wrote the sticky text, so just pretend we never had
    // any to begin with
    this.#stickyText = "";
    this._updateStickyTextLinesToClear();
  }

  private _write(text: string): void {
    if (env.testLike) {
      if (text.endsWith("\n")) {
        // we use console.log/error in tests since vitest doesn't
        // display process.stdout/stderr correctly, so we need to remove
        // the trailing newline because console.log/error adds one
        text = text.slice(0, -1);
      }

      if (this.channel === "stdout") {
        console.log(text);
      } else {
        console.error(text);
      }
    }

    this.#stream.write(text);
  }

  private _updateStickyTextLinesToClear(): void {
    if (this.#stickyText === "") {
      this.#stickyTextLinesToClear = 0;
      return;
    }

    for (const line of stripAnsi(this.#stickyText).split("\n")) {
      const lineWidth = stringWidth(line, { countAnsiEscapeCodes: true });
      const lineRowCount = Math.max(1, Math.ceil(lineWidth / this.#stream.columns));
      this.#stickyTextLinesToClear += lineRowCount;
    }
  }

  private _format(text: string): string {
    // remove duplicate empty lines
    while (text.startsWith("\n\n")) {
      text = text.slice(0, -1);
    }

    while (text.endsWith("\n\n")) {
      text = text.slice(0, -1);
    }

    text = text.replaceAll(/\n\n+/g, "\n\n");

    if (this.lastLineWasEmpty) {
      // we just printed an empty line, so don't print another one
      while (text.startsWith("\n")) {
        text = text.slice(1);
      }
    }

    return text;
  }
}

export const stdout = new Stream("stdout");
export const stderr = new Stream("stderr");
