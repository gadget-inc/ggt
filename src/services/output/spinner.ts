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
   * The position of the spinner in relation to the text.
   *
   * @default "start"
   */
  // TODO: "top-left" | "top-right" | "bottom-left" | "bottom-right"
  position?: "start" | "end";

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

    if (!output.isInteractive) {
      // write the message to stdout
      output.writeStdout(sprintln(options)(str));

      return {
        clear: () => {
          activeSpinner = false;
        },
        succeed: (successStr = str, ...values) => {
          if (!isString(successStr)) {
            successStr = sprintln(options)(successStr, ...values);
          }
          output.writeStdout(successStr);
          activeSpinner = false;
        },
        fail: (failStr = str, ...values) => {
          if (!isString(failStr)) {
            failStr = sprintln(failStr, ...values);
          }
          output.writeStdout(failStr);
          activeSpinner = false;
        },
      };
    }

    const {
      ensureNewLine = true,
      ensureEmptyLineAbove = false,
      kind = "dots",
      position = "start",
      color = "white",
      successSymbol = chalk.green("✔"),
      failSymbol = chalk.red("✖"),
    } = options;

    let frameIndex = 0;
    const frames = cliSpinners[kind].frames;
    const interval = cliSpinners[kind].interval;

    type RenderOptions = { symbol?: string; message: string; final?: boolean };

    const render = ({ symbol, message, final = false }: RenderOptions): void => {
      if (symbol === undefined) {
        frameIndex = ++frameIndex % frames.length;
        symbol = chalk[color](frames[frameIndex]);
      }

      // strip leading and trailing newlines so we can add them back in
      // the right place
      while (message.startsWith("\n")) {
        message = message.slice(1);
      }

      while (message.endsWith("\n")) {
        message = message.slice(0, -1);
      }

      if (message) {
        if (symbol) {
          const lines = message.split(/\r?\n/);
          lines[0] = position === "start" ? `${symbol} ${lines[0]}` : `${lines[0]} ${symbol}`;
          message = lines.join(os.EOL);
        }

        if (ensureEmptyLineAbove && !message.startsWith("\n")) {
          message = "\n" + message;
        }

        if (ensureNewLine && !message.endsWith("\n")) {
          message += "\n";
        }
      }

      if (!final) {
        output.updateSpinner(message);
        return;
      }

      output.persistSpinner(message);
      activeSpinner = false;
    };

    // start rendering the spinner
    render({ message: str });
    const spinnerInterval = setInterval(() => render({ message: str }), interval);

    // setup the last render
    const finalRender = (renderOptions: Omit<RenderOptions, "final">): void => {
      render({ ...renderOptions, final: true });
      clearInterval(spinnerInterval);
    };

    return {
      clear: (): void => {
        finalRender({ symbol: "", message: "" });
      },
      succeed: (finalStr?: string | TemplateStringsArray, ...values: unknown[]): void => {
        finalStr ??= str;
        if (!isString(finalStr)) {
          finalStr = dedent(chalkTemplate(finalStr, ...values));
        }
        finalRender({ message: finalStr, symbol: successSymbol });
      },
      fail: (finalStr?: string | TemplateStringsArray, ...values: unknown[]): void => {
        finalStr ??= str;
        if (!isString(finalStr)) {
          finalStr = dedent(chalkTemplate(finalStr, ...values));
        }
        finalRender({ message: finalStr, symbol: failSymbol });
      },
    };
  }) as spin;
};

export const spin = createSpin({});
