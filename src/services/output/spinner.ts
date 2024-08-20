import type { ColorName } from "chalk";
import chalk from "chalk";
import type { SpinnerName } from "cli-spinners";
import cliSpinners from "cli-spinners";
import assert from "node:assert";
import os from "node:os";
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

export let activeSpinner: spinner | undefined;

export const spin = (options: string | SpinnerOptions): spinner => {
  assert(!activeSpinner, "a spinner is already active");

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
        // we're in a non-interactive terminal, therefor
        // ensureEmptyLineAbove only applies to the first render.
        // strip it so that the final render of the spinner is right
        // below the first render of the spinner
        message = message.slice(1);
      }

      // this is the final render, so persist the spinner
      output.persistSpinner(message);
      activeSpinner = undefined;
      return;
    }

    // this is not the final render, so we need to update the spinner
    if (output.isInteractive) {
      // we're in an interactive terminal, so update the spinner
      output.updateSpinner(message);
    } else if (firstRender) {
      // we're not in an interactive terminal, and this is the first
      // render, so just write the first render to stdout
      output.writeStdout(message);
      firstRender = false;
    }
  };

  // render the first frame
  render({ content });

  let spinnerInterval: NodeJS.Timeout | undefined;
  if (output.isInteractive) {
    // we are in an interactive terminal, so keep rendering the spinner
    spinnerInterval = setInterval(() => render({ content }), interval);
  }

  // setup the last render
  const finalRender = (renderOptions: Omit<RenderOptions, "final">): void => {
    render({ ...renderOptions, final: true });
    clearInterval(spinnerInterval);
  };

  activeSpinner = {
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

  return activeSpinner;
};
