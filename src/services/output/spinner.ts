import os from "node:os";

import type { ColorName } from "chalk";
import chalk from "chalk";
import type { SpinnerName } from "cli-spinners";
import cliSpinners from "cli-spinners";

import { output } from "./output.js";
import { type SprintOptionsWithContent } from "./sprint.js";
import { symbol } from "./symbols.js";

export type SpinnerOptions = SprintOptionsWithContent & {
  /**
   * The name of the spinner to use.
   *
   * @default "dots"
   * @see https://github.com/sindresorhus/cli-spinners
   */
  kind?: SpinnerName;

  /**
   * The color of the spinner.
   *
   * @default "cyan"
   * @see https://github.com/chalk/chalk
   */
  color?: ColorName;

  /**
   * The symbol to display when the spinner succeeds.
   *
   * @default "✔"
   */
  successSymbol?: string;

  /**
   * The symbol to display when the spinner fails.
   *
   * @default "✖"
   */
  failSymbol?: string;
};

export type spinner = {
  text: string;
  clear: () => void;
  succeed(str?: string): void;
  fail(str?: string): void;
};

const _spinners: spinner[] = [];
const _currentTexts = new WeakMap<spinner, string>();
export let activeSpinner: spinner | undefined;

/**
 * Composes all active spinners' current texts into a single string
 * and passes it to the output layer's sticky area.
 */
const _updateDisplay = (): void => {
  if (!output.isInteractive) return;
  const combined = _spinners.map((s) => _currentTexts.get(s) ?? "").join("");
  output.updateSpinner(combined);
};

export const clearAllSpinners = (): void => {
  for (let i = _spinners.length - 1; i >= 0; i--) {
    _spinners[i]?.clear();
  }
  activeSpinner = undefined;
};

export const spin = (options: string | SpinnerOptions): spinner => {
  const {
    content,
    ensureNewLine = true,
    ensureEmptyLineAbove = false,
    kind = "dots",
    color = "white",
    successSymbol = chalk.green(symbol.tick),
    failSymbol = chalk.red(symbol.cross),
  } = typeof options === "string" ? { content: options } : options;

  let frameIndex = 0;
  const frames = cliSpinners[kind].frames;
  const interval = cliSpinners[kind].interval;

  type RenderOptions = { symbol?: string; content: string; final?: boolean };
  let firstRender = true;
  let finalized = false;

  let self!: spinner;

  const render = ({ symbol, content: message, final: finalRender = false }: RenderOptions): void => {
    // strip leading and trailing newlines so we can add them back in
    // the right place
    while (message.startsWith("\n")) {
      message = message.slice(1);
    }

    while (message.endsWith("\n")) {
      message = message.slice(0, -1);
    }

    // if no symbol is provided, use the next frame
    if (symbol === undefined) {
      frameIndex = ++frameIndex % frames.length;
      symbol = chalk[color](frames[frameIndex]);
    }

    if (message) {
      // we have a message to display
      if (symbol) {
        // add the spinner symbol to the first line of the message
        const lines = message.split(/\r?\n/);
        lines[0] = `${symbol} ${lines[0]}`;
        message = lines.join(os.EOL);
      }

      if (ensureEmptyLineAbove && !message.startsWith("\n")) {
        // add an empty line before the symbol
        message = "\n" + message;
      }

      if (ensureNewLine && !message.endsWith("\n")) {
        // add a newline after the message
        message += "\n";
      }
    }

    if (finalRender) {
      if (!output.isInteractive && ensureEmptyLineAbove) {
        // we're in a non-interactive terminal, therefore
        // ensureEmptyLineAbove only applies to the first render.
        // strip it so that the final render of the spinner is right
        // below the first render of the spinner
        message = message.slice(1);
      }

      // this is the final render, so persist the spinner
      output.persistSpinner(message);
      return;
    }

    // this is not the final render, so we need to update the spinner
    if (output.isInteractive) {
      // store this spinner's current text and refresh the combined display
      _currentTexts.set(self, message);
      _updateDisplay();
    } else if (firstRender) {
      // we're not in an interactive terminal, and this is the first
      // render, so just write the first render to stdout
      output.writeStdout(message);
      firstRender = false;
    }
  };

  let spinnerInterval: NodeJS.Timeout | undefined;

  // setup the last render
  const finalRender = (renderOptions: Omit<RenderOptions, "final">): void => {
    if (finalized) return;
    finalized = true;
    render({ ...renderOptions, final: true });
    clearInterval(spinnerInterval);
    const idx = _spinners.indexOf(self);
    if (idx !== -1) {
      _spinners.splice(idx, 1);
    }
    _currentTexts.delete(self);
    const promoted = _spinners[_spinners.length - 1] as spinner | undefined;
    activeSpinner = promoted;
    // refresh the sticky area with remaining spinners
    _updateDisplay();
  };

  self = {
    text: content,
    clear(): void {
      this.text = "";
      finalRender({ symbol: "", content: "" });
    },
    succeed(finalContent?: string): void {
      finalContent ??= content;
      this.text = finalContent;
      finalRender({ content: finalContent, symbol: successSymbol });
    },
    fail(finalContent?: string): void {
      finalContent ??= content;
      this.text = finalContent;
      finalRender({ content: finalContent, symbol: failSymbol });
    },
  };

  _spinners.push(self);
  activeSpinner = self;

  // render the first frame (must be after self is assigned so
  // _currentTexts.set(self, ...) works in interactive mode)
  render({ content });

  if (output.isInteractive) {
    // we are in an interactive terminal, so keep rendering the spinner
    // every spinner animates independently and _updateDisplay() composes them
    spinnerInterval = setInterval(() => {
      render({ content });
    }, interval);
  }

  return self;
};
