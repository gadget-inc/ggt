import cliCursor from "cli-cursor";
import process from "node:process";
import stringWidth from "string-width";
import stripAnsi from "strip-ansi";
import { env } from "../config/env.js";
import { unthunk } from "../util/function.js";
import { isObject } from "../util/is.js";
import stdinDiscarder from "./stdin.js";

let cursorIsHidden = false;
let stdinIsBeingDiscarded = false;

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
   * This is automatically calculated by the {@linkcode write} method,
   * so you only need to set this property manually when you know
   * something else wrote to the stream directly (e.g. `ora`).
   */
  lastPrintedLineWasEmpty = true;

  lastStickyLineWasEmpty = true;

  private _headerText = "";

  private _promptText = "";

  private _spinnerText = "";

  private _footerText = "";

  private _stickyTextLinesToClear = 0;

  #stream;

  constructor(public channel: "stdout" | "stderr") {
    this.#stream = process[this.channel];
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

  write(text: string): void {
    this._clearStickyText();

    text = this._stripUnnecessaryNewLines(text, this.lastPrintedLineWasEmpty);
    this._write(text);
    this.lastPrintedLineWasEmpty = text === "\n" || text.endsWith("\n\n");

    this._writeStickyText();
  }

  updateHeader(headerTextThunk: string | ((currentHeaderText: string) => string)): void {
    this._headerText = unthunk(headerTextThunk, this._headerText);
    this._clearStickyText();
    this._writeStickyText();
  }

  persistHeader(finalHeaderText = this._headerText): void {
    this._headerText = "";
    this.write(finalHeaderText);
  }

  updatePrompt(promptTextThunk: string | ((currentPromptText: string) => string)): void {
    this._promptText = unthunk(promptTextThunk, this._promptText);
    this._clearStickyText();
    this._writeStickyText();
  }

  persistPrompt(finalPromptText = this._promptText): void {
    this._promptText = "";
    this.write(finalPromptText);
  }

  updateSpinner(spinnerTextThunk: string | ((currentSpinnerText: string) => string)): void {
    this._spinnerText = unthunk(spinnerTextThunk, this._spinnerText);
    this._clearStickyText();
    this._writeStickyText();
  }

  persistSpinner(finalSpinnerText = this._spinnerText): void {
    this._spinnerText = "";
    this.write(finalSpinnerText);
  }

  updateFooter(footerTextThunk: string | ((currentFooterText: string) => string)): void {
    this._footerText = unthunk(footerTextThunk, this._footerText);
    this._clearStickyText();
    this._writeStickyText();
  }

  persistFooter(finalFooterText = this._footerText): void {
    this._footerText = "";
    this.write(finalFooterText);
  }

  private _stripUnnecessaryNewLines(text: string, lastLineWasEmpty: boolean): string {
    // remove duplicate empty lines
    let index = -1;
    while ((index = text.indexOf("\n\n\n")) !== -1) {
      text = text.slice(0, index) + text.slice(index + 1);
    }

    if (lastLineWasEmpty && text.startsWith("\n")) {
      // we just printed an empty line, so don't print another one
      text = text.slice(1);
    }

    return text;
  }

  private _write(text: string): void {
    if (text === "") {
      return;
    }

    if (!env.testLike) {
      this.#stream.write(text);
      return;
    }

    // we use console.log/error in tests since vitest doesn't display
    // process.stdout/stderr correctly, so we need to remove the
    // trailing newline because console.log/error adds one
    if (text.endsWith("\n")) {
      text = text.slice(0, -1);
    }

    if (this.channel === "stdout") {
      console.log(text);
    } else {
      console.error(text);
    }
  }

  private _clearStickyText(): void {
    if (!this.#stream.isTTY || this._stickyTextLinesToClear === 0) {
      return;
    }

    this.#stream.cursorTo(0);
    for (let i = 0; i < this._stickyTextLinesToClear; i++) {
      if (i > 0) {
        this.#stream.moveCursor(0, -1);
      }
      this.#stream.clearLine(1);
    }

    this._stickyTextLinesToClear = 0;

    // TODO: figure out if this is correct
    this.lastStickyLineWasEmpty = this.lastPrintedLineWasEmpty;
  }

  private _writeStickyText(): void {
    let formattedStickyText = "";
    if (this._headerText) {
      formattedStickyText += this._stripUnnecessaryNewLines(this._headerText, this.lastStickyLineWasEmpty);
      this.lastStickyLineWasEmpty = formattedStickyText === "\n" || formattedStickyText.endsWith("\n\n");
    }

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

    this._write(formattedStickyText);
    this._updateStickyTextLinesToClear(formattedStickyText);

    if (formattedStickyText && !cursorIsHidden) {
      cliCursor.hide(this.#stream);
      cursorIsHidden = true;
    } else if (!formattedStickyText && cursorIsHidden) {
      cliCursor.show(this.#stream);
      cursorIsHidden = false;
    }

    if (this._promptText && !stdinIsBeingDiscarded) {
      stdinDiscarder.start();
      stdinIsBeingDiscarded = true;
    } else if (!this._promptText && stdinIsBeingDiscarded) {
      stdinDiscarder.stop();
      stdinIsBeingDiscarded = false;
    }
  }

  private _updateStickyTextLinesToClear(lastWrittenStickyText: string): void {
    for (const line of stripAnsi(lastWrittenStickyText).split(/\r?\n/)) {
      const numCharacters = stringWidth(line, { countAnsiEscapeCodes: true });
      const numLines = Math.ceil(numCharacters / this.#stream.columns);
      this._stickyTextLinesToClear += Math.max(1, numLines);
    }
  }
}

// TODO: combine into a single object
export const stdout = new Output("stdout");
export const stderr = new Output("stderr");
