import cliCursor from "cli-cursor";
import isInteractive from "is-interactive";
import assert from "node:assert";
import process from "node:process";
import stdinDiscarder from "stdin-discarder";
import stringWidth from "string-width";
import stripAnsi from "strip-ansi";
import { env } from "../config/env.js";
import { unthunk } from "../util/function.js";
import { isObject } from "../util/is.js";

let cursorIsHidden = false;

/**
 * Stderr
 * Prompt
 * Spinner
 * Footer
 */
export class Output {
  /**
   * Indicates whether the last line that was written to the stream was
   * empty (i.e. "\n"). This is useful for preventing duplicate empty
   * lines from being printed.
   *
   * This is automatically calculated by the {@linkcode writeStdout}
   * method, so you only need to set this property manually when you
   * know something else wrote to the stream directly.
   */
  lastPrintedLineWasEmpty = true;

  lastStickyLineWasEmpty = true;

  private _promptText = "";

  private _spinnerText = "";

  private _footerText = "";

  private _stickyTextLinesToClear = 0;

  constructor() {
    process.stdout.on("error", (err: unknown) => {
      if (isObject(err) && "code" in err && err.code === "EPIPE") {
        return;
      }
      throw err;
    });

    process.stderr.on("error", (err: unknown) => {
      if (isObject(err) && "code" in err && err.code === "EPIPE") {
        return;
      }
      throw err;
    });
  }

  get isInteractive(): boolean {
    return !env.testLike && isInteractive({ stream: process.stdout });
  }

  writeStdout(text: string): void {
    this._clearStickyText();

    text = this._stripUnnecessaryNewLines(text, this.lastPrintedLineWasEmpty);
    this._writeStdout(text);
    this.lastPrintedLineWasEmpty = text === "\n" || text.endsWith("\n\n");
    this.lastStickyLineWasEmpty = this.lastPrintedLineWasEmpty;

    this._writeStickyText();
  }

  writeStderr(text: string): void {
    this._clearStickyText();

    text = this._stripUnnecessaryNewLines(text, this.lastPrintedLineWasEmpty);
    this._writeStderr(text);
    this.lastPrintedLineWasEmpty = text === "\n" || text.endsWith("\n\n");
    this.lastStickyLineWasEmpty = this.lastPrintedLineWasEmpty;

    this._writeStickyText();
  }

  updatePrompt(promptTextThunk: string | ((currentPromptText: string) => string)): void {
    assert(this.isInteractive, "cannot update prompt in non-interactive mode");
    this._promptText = unthunk(promptTextThunk, this._promptText);
    this._writeStickyText();
  }

  persistPrompt(finalPromptText = this._promptText): void {
    this._promptText = "";
    this.writeStdout(finalPromptText);
  }

  updateSpinner(spinnerTextThunk: string | ((currentSpinnerText: string) => string)): void {
    assert(this.isInteractive, "cannot update spinner in non-interactive mode");
    this._spinnerText = unthunk(spinnerTextThunk, this._spinnerText);
    this._writeStickyText();
  }

  persistSpinner(finalSpinnerText = this._spinnerText): void {
    this._spinnerText = "";
    this.writeStdout(finalSpinnerText);
  }

  updateFooter(footerTextThunk: string | ((currentFooterText: string) => string)): void {
    assert(this.isInteractive, "cannot update footer in non-interactive mode");
    this._footerText = unthunk(footerTextThunk, this._footerText);
    this._writeStickyText();
  }

  persistFooter(finalFooterText = this._footerText): void {
    this._footerText = "";
    this.writeStdout(finalFooterText);
  }

  private _writeStdout(text: string): void {
    if (text === "") {
      return;
    }

    if (!env.testLike) {
      process.stdout.write(text);
      return;
    }

    // we use console.log/error in tests since vitest doesn't display
    // process.stdout/stderr correctly, so we need to remove the
    // trailing newline because console.log/error adds one
    if (text.endsWith("\n")) {
      text = text.slice(0, -1);
    }

    console.log(text);
  }

  private _writeStderr(text: string): void {
    if (text === "") {
      return;
    }

    if (!env.testLike) {
      process.stderr.write(text);
      return;
    }

    // we use console.log/error in tests since vitest doesn't display
    // process.stdout/stderr correctly, so we need to remove the
    // trailing newline because console.log/error adds one
    if (text.endsWith("\n")) {
      text = text.slice(0, -1);
    }

    console.error(text);
  }

  private _clearStickyText(): void {
    this.lastStickyLineWasEmpty = this.lastPrintedLineWasEmpty;
    if (this._stickyTextLinesToClear === 0) {
      return;
    }

    process.stderr.cursorTo(0);
    for (let i = 0; i < this._stickyTextLinesToClear; i++) {
      if (i > 0) {
        process.stderr.moveCursor(0, -1);
      }
      process.stderr.clearLine(1);
    }

    this._stickyTextLinesToClear = 0;
  }

  private _writeStickyText(): void {
    if (!this.isInteractive) {
      return;
    }

    this._clearStickyText();

    let formattedStickyText = "";
    if (this._promptText) {
      formattedStickyText += this._stripUnnecessaryNewLines(this._promptText, this.lastStickyLineWasEmpty);
      this.lastStickyLineWasEmpty = formattedStickyText === "\n" || formattedStickyText.endsWith("\n\n");
    }

    if (this._spinnerText) {
      formattedStickyText += this._stripUnnecessaryNewLines(this._spinnerText, this.lastStickyLineWasEmpty);
      this.lastStickyLineWasEmpty = formattedStickyText === "\n" || formattedStickyText.endsWith("\n\n");
    }

    if (this._footerText) {
      formattedStickyText += this._stripUnnecessaryNewLines(this._footerText, this.lastStickyLineWasEmpty);
      this.lastStickyLineWasEmpty = formattedStickyText === "\n" || formattedStickyText.endsWith("\n\n");
    }

    this._writeStderr(formattedStickyText);
    this._updateStickyTextLinesToClear(formattedStickyText);

    if (cursorIsHidden && !formattedStickyText) {
      cliCursor.show(process.stderr);
      stdinDiscarder.stop();
      cursorIsHidden = false;
    } else if (!cursorIsHidden && formattedStickyText) {
      cliCursor.hide(process.stderr);
      stdinDiscarder.start();
      cursorIsHidden = true;
    }
  }

  private _updateStickyTextLinesToClear(lastWrittenStickyText: string): void {
    for (const line of stripAnsi(lastWrittenStickyText).split(/\r?\n/)) {
      const numCharacters = stringWidth(line, { countAnsiEscapeCodes: true });
      const numLines = Math.ceil(numCharacters / process.stderr.columns);
      this._stickyTextLinesToClear += Math.max(1, numLines);
    }
  }

  private _stripUnnecessaryNewLines(text: string, lastLineWasEmpty: boolean): string {
    // remove duplicate empty lines
    let index = -1;
    while ((index = text.indexOf("\n\n\n")) !== -1) {
      text = text.slice(0, index) + text.slice(index + 1);
    }

    if (lastLineWasEmpty) {
      // we just printed an empty line, so don't print another one
      while (text.startsWith("\n")) {
        text = text.slice(1);
      }
    }

    return text;
  }
}

export const output = new Output();
