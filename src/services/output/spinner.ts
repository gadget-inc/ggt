import type { ColorName } from "chalk";
import chalk from "chalk";
import chalkTemplate from "chalk-template";
import type { SpinnerName } from "cli-spinners";
import cliSpinners from "cli-spinners";
import assert from "node:assert";
import os from "node:os";
import { dedent } from "ts-dedent";
import { isString } from "../util/is.js";
import { output } from "./output.js";
import { isSprintOptions, sprintln } from "./print.js";

export type SpinnerOptions = {
  /**
   * Whether to ensure a new line is after the text.
   *
   * @default false
   */
  ensureNewLine?: boolean;

  /**
   * Whether to ensure an empty line is above the spinner.
   *
   * @default false
   */
  ensureEmptyLineAbove?: boolean;

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

  // /**
  //  * The text to display when the spinner is done.
  //  */
  // onComplete?: (render: (opts: SpinnerRenderOptions) => void, value: T) => void;
  successSymbol?: string;

  // /**
  //  * @param error - The error that caused the spinner to fail.
  //  * @returns The text to display when the spinner fails.
  //  */
  // onError?: (render: (opts: SpinnerRenderOptions) => void, error: unknown) => void;
  failSymbol?: string;
};

export type spin = {
  (str: string): spinner;
  (template: TemplateStringsArray, ...values: unknown[]): spinner;
  (options: Omit<SpinnerOptions, "str">): spin;
};

export type spinner = {
  text: string;
  clear: () => void;
  succeed: {
    (str?: string): void;
    (template: TemplateStringsArray, ...values: unknown[]): void;
  };
  fail: {
    (str?: string): void;
    (template: TemplateStringsArray, ...values: unknown[]): void;
  };
};

let activeSpinner = false;

export const createSpin = (options: SpinnerOptions): spin => {
  return ((optionsOrString: SpinnerOptions | string | TemplateStringsArray, ...values: unknown[]): spin | spinner => {
    if (isSprintOptions(optionsOrString)) {
      return createSpin({ ...options, ...optionsOrString });
    }

    assert(!activeSpinner, "a spinner is already active");
    activeSpinner = true;

    let str = optionsOrString as string;
    if (!isString(str)) {
      str = sprintln(str, ...values);
    }

    const {
      ensureNewLine = true,
      ensureEmptyLineAbove = false,
      kind = "dots",
      color = "white",
      successSymbol = chalk.green("✔"),
      failSymbol = chalk.red("✖"),
    } = options;

    let frameIndex = 0;
    const frames = cliSpinners[kind].frames;
    const interval = cliSpinners[kind].interval;

    type RenderOptions = { symbol?: string; message: string; final?: boolean };
    let firstRender = true;

    const render = ({ symbol, message, final: finalRender = false }: RenderOptions): void => {
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
          // ensureEmptyLineAbove only applies to the first render.
          // strip it so that the final render of the spinner is right
          // below the first render of the spinner
          message = message.slice(1);
        }

        // this is the final render, so persist the spinner
        output.persistSpinner(message);
        activeSpinner = false;
        return;
      }

      // this is not the final render, so we need to update the spinner
      if (output.isInteractive) {
        // we are in an interactive terminal, so update the spinner
        output.updateSpinner(message);
      } else if (firstRender) {
        // we are not in an interactive terminal, and this is the first
        // render, so write the message to stdout
        output.writeStdout(message);
        firstRender = false;
      }
    };

    // render the first frame
    render({ message: str });

    let spinnerInterval: NodeJS.Timeout | undefined;
    if (output.isInteractive) {
      // we are in an interactive terminal, so keep rendering the spinner
      spinnerInterval = setInterval(() => render({ message: str }), interval);
    }

    // setup the last render
    const finalRender = (renderOptions: Omit<RenderOptions, "final">): void => {
      render({ ...renderOptions, final: true });
      clearInterval(spinnerInterval);
    };

    return {
      text: str,
      clear(): void {
        this.text = "";
        finalRender({ symbol: "", message: "" });
      },
      succeed(finalStr?: string | TemplateStringsArray, ...values: unknown[]): void {
        finalStr ??= str;
        if (!isString(finalStr)) {
          finalStr = dedent(chalkTemplate(finalStr, ...values));
        }
        this.text = finalStr;
        finalRender({ message: finalStr, symbol: successSymbol });
      },
      fail(finalStr?: string | TemplateStringsArray, ...values: unknown[]): void {
        finalStr ??= str;
        if (!isString(finalStr)) {
          finalStr = dedent(chalkTemplate(finalStr, ...values));
        }
        this.text = finalStr;
        finalRender({ message: finalStr, symbol: failSymbol });
      },
    } as spinner;
  }) as spin;
};

export const spin = createSpin({});
