import type { Options as BoxenOptions } from "boxen";
import boxen from "boxen";
import chalk, { type ColorName } from "chalk";
import chalkTemplate from "chalk-template";
import cliSpinners, { type SpinnerName } from "cli-spinners";
import CliTable3 from "cli-table3";
import assert from "node:assert";
import { dedent } from "ts-dedent";
import { config } from "../config/config.js";
import { isArray, isString } from "../util/is.js";
import type { Field } from "./log/field.js";
import { formatPretty } from "./log/format/pretty.js";
import { Level } from "./log/level.js";
import { stderr } from "./stream.js";

export type PrintOutput = "stdout" | "string" | "spinner" | "sticky";

// prettier-ignore
export type PrintOutputReturnType<Output extends PrintOutput | undefined> =
    Output extends undefined ? undefined
  : Output extends "stdout" ? undefined
  : Output extends "sticky" ? undefined
  : Output extends "string" ? string
  : Output extends "spinner" ? Spinner
  : never;

export type Spinner = {
  done: (text?: string) => void;
  succeed: (text?: string) => void;
  fail: (text?: string) => void;
};

export type PrintOptions<Output extends PrintOutput = "stdout"> = {
  /**
   * Whether to ensure a new line is after the content.
   *
   * @default true
   */
  ensureNewLine?: boolean;

  /**
   * Whether to ensure an empty line is above the content.
   *
   * @default false
   */
  ensureNewLineAbove?: boolean;

  output?: Output;

  spinner?: {
    /**
     * The name of the spinner to use.
     *
     * @default "dots"
     * @see https://github.com/sindresorhus/cli-spinners
     */
    kind?: SpinnerName;

    prefix?: string;

    suffix?: string;

    color?: ColorName;
  };

  /**
   * The options to pass to `boxen`.
   *
   * @default undefined (no box)
   */
  boxen?: BoxenOptions;

  /**
   * What to print if --json was passed.
   *
   * @default undefined (print nothing)
   */
  json?: Record<string, Field>;
};

export type print<Options extends PrintOptions<PrintOutput>> = {
  /**
   * Prints the given string as is.
   *
   * @param str - The string to print.
   * @example
   * print("Hello, world!");
   * // => "Hello, world!"
   *
   * print(`
   *   Hello, world!
   *
   *   How are you?
   * `);
   * // => "\n  Hello, world!\n\n  How are you?\n"
   */
  (str: string): PrintOutputReturnType<Options["output"]>;

  /**
   * Prints the given template string with dedent and chalk-template.
   *
   * @param template - The template string to format.
   * @param values - The values to interpolate into the template.
   * @example
   * ```
   * let name = "Jane";
   *
   * print`Hello, ${name}!`;
   * // => "Hello, Jane!"
   *
   * print`Hello, {red ${name}}!`;
   * // => "Hello, \u001b[31mJane\u001b[39m!"
   *
   * print`
   *   Hello, {red ${name}}!
   *
   *   How are you?
   * `;
   * // => "Hello, \u001b[31mJane\u001b[39m!\n\nHow are you?"
   * ```
   * @see dedent https://github.com/tamino-martinius/node-ts-dedent
   * @see chalk-template https://github.com/chalk/chalk-template
   */
  (template: TemplateStringsArray, ...values: unknown[]): PrintOutputReturnType<Options["output"]>;

  /**
   * Configures print with options before printing the given template
   * string with dedent and chalk-template.
   *
   * @example
   * ```
   * let name = "Jane";
   * print({ ensureNewLineAbove: true })`Hello, ${name}!`;
   * // => "\nHello, Jane!"
   *
   * print({ ensureNewLineAbove: true })`Hello, {red ${name}}!`;
   * // => "\nHello, \u001b[31mJane\u001b[39m!"
   *
   * print({ ensureNewLineAbove: true })`
   *   Hello, {red ${name}}!
   *
   *   How are you?
   * `;
   * // => "\nHello, \u001b[31mJane\u001b[39m!\n\nHow are you?"
   * ```
   * @see PrintOptions
   */
  <const NewOptions extends PrintOptions<PrintOutput>>(options: NewOptions): print<Options & NewOptions>;
};

let activeSpinner = false;

export const createPrint = <const Options extends PrintOptions<PrintOutput>>(options: Options): print<Options> => {
  const print = ((
    templateOrOptions: Options | string | TemplateStringsArray,
    ...values: unknown[]
  ): print<Options> | PrintOutputReturnType<PrintOptions<PrintOutput>["output"]> => {
    if (!(isString(templateOrOptions) || isArray(templateOrOptions))) {
      return createPrint({ ...options, ...templateOrOptions });
    }

    const {
      json,
      output = "stdout",
      ensureNewLine = false,
      ensureNewLineAbove = false,
      boxen: boxenOptions,
      spinner: spinnerOptions,
    } = options;

    let text = templateOrOptions as string;
    if (!isString(text)) {
      text = dedent(chalkTemplate(text, ...values));
    }

    if (boxenOptions) {
      text = boxen(text, boxenOptions);
    }

    if (ensureNewLineAbove && !text.startsWith("\n")) {
      text = "\n" + text;
    }

    if (ensureNewLine && !text.endsWith("\n")) {
      text += "\n";
    }

    if (output === "string") {
      return text;
    }

    if (output === "spinner") {
      assert(!activeSpinner, "only one spinner can be active at a time");
      activeSpinner = true;

      let { kind = "dots", prefix = "", suffix = "", color = "cyan" } = spinnerOptions ?? {};

      if (ensureNewLineAbove) {
        if (!prefix.startsWith("\n")) {
          // add a newline before the spinner
          prefix = "\n" + prefix;
        }

        // strip the newline we added above
        text = text.slice(1);
      }

      if (ensureNewLine) {
        if (!suffix.endsWith("\n")) {
          // add a newline after the spinner
          suffix += "\n";
        }

        // strip the newline we added above
        text = text.slice(0, -1);
      }

      // setup the spinner
      const { frames, interval } = cliSpinners[kind];
      const originalStickyText = stderr.stickyText;

      let frameIndex = 0;
      const printNextSpinnerFrame = (): void => {
        frameIndex = ++frameIndex % frames.length;
        const frame = chalk[color](frames[frameIndex]);
        stderr.replaceStickyText(`${prefix}${frame} ${text}${suffix}${originalStickyText}`);
      };

      // start the spinner
      printNextSpinnerFrame();
      const spinnerId = setInterval(() => printNextSpinnerFrame(), interval);

      return {
        done(doneText = text) {
          // stop rendering the spinner
          clearInterval(spinnerId);

          // set the original sticky text back
          stderr.replaceStickyText(originalStickyText);

          // print the success message
          stderr.write(`${prefix}${doneText}${suffix}`);

          activeSpinner = false;
        },
        succeed(successText = text) {
          this.done(`${chalk.green("✔")} ${successText}`);
        },
        fail(failureText = text) {
          this.done(`${chalk.red("✖")} ${failureText}`);
        },
      } as Spinner;
    }

    if (output === "sticky") {
      stderr.replaceStickyText(text);
      return;
    }

    // FIXME: this is probably wrong (needs to be moved up/down)
    if (config.logFormat === "json") {
      if (json) {
        text = JSON.stringify(json) + "\n";
      } else {
        text = "";
      }
    }

    // FIXME: this as well
    if (config.logLevel < Level.PRINT) {
      text = formatPretty(Level.PRINT, "", text, {});
    }

    stderr.write(text);

    return undefined;
  }) as print<Options>;

  return print;
};

export const print = createPrint({ ensureNewLine: false });
export const println = createPrint({ ensureNewLine: true });

export const sprint = createPrint({ output: "string", ensureNewLine: false });
export const sprintln = createPrint({ output: "string", ensureNewLine: true });

export const printTable = <const Output extends PrintOutput>({
  message,
  headers,
  rows,
  footer,
  borders: borderType = "none",
  spaceY = 0,
  colAligns = [],
  colWidths = [],
  ...printOptions
}: PrintTableOptions<Output>): PrintOutputReturnType<Output> => {
  const table = new CliTable3({
    chars: borders[borderType],
    colAligns,
    colWidths,
    head: headers,
    style: { head: [], border: [] },
  });

  table.push(...rows);

  const padding = "\n".repeat(spaceY + 1);

  let output = "";
  if (message) {
    output += message + padding;
  }

  if (borderType === "none") {
    // remove the left padding
    output += dedent(table.toString()).slice(1);
  } else {
    output += table.toString();
  }

  if (footer) {
    output += padding + footer;
  }

  return createPrint({ ensureNewLine: true, ...printOptions })(output) as PrintOutputReturnType<Output>;
};

export type PrintTableOptions<Output extends PrintOutput = "stdout"> = PrintOptions<Output> & {
  /**
   * The message to print above the table.
   */
  message?: string;

  /**
   * The headers of the table.
   */
  headers?: string[];

  /**
   * The rows of the table.
   */
  rows: string[][];

  /**
   * The message to print below the table.
   */
  footer?: string;

  /**
   * The type of borders to use.
   *
   * @default "none"
   */
  borders?: "none" | "thin" | "thick";

  /**
   * The amount of empty lines to print between the message, table,
   * and footer.
   *
   * @default 0
   */
  spaceY?: number;

  /**
   * The alignment of the content in each column.
   *
   * @default [] (left-aligned)
   */
  colAligns?: ("left" | "center" | "right")[];

  /**
   * The width of each column.
   *
   * @default [] (auto-sized)
   */
  colWidths?: number[];
};

// prettier-ignore
const borders = {
  none: {
       "top-left": "",    top: "",    "top-mid": "",    "top-right": "",
       "left-mid": "",    mid: "",    "mid-mid": "",    "right-mid": "",
             left: "",                   middle: "",          right: "",
    "bottom-left": "", bottom: "", "bottom-mid": "", "bottom-right": "",
  },
  thin: {
       "top-left": "┌",    top: "─",    "top-mid": "┬",    "top-right": "┐",
       "left-mid": "├",    mid: "─",    "mid-mid": "┼",    "right-mid": "┤",
             left: "│",                    middle: "│",          right: "│",
    "bottom-left": "└", bottom: "─", "bottom-mid": "┴", "bottom-right": "┘",
  },
  thick: {
       "top-left": "╔",    top: "═",    "top-mid": "╤",    "top-right": "╗",
             left: "║",                    middle: "│",          right: "║",
       "left-mid": "╟",    mid: "─",    "mid-mid": "┼",    "right-mid": "╢",
    "bottom-left": "╚", bottom: "═", "bottom-mid": "╧", "bottom-right": "╝",
  },
};
