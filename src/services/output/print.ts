import type { Options as BoxenOptions } from "boxen";
import boxen from "boxen";
import chalkTemplate from "chalk-template";
import CliTable3 from "cli-table3";
import { dedent } from "ts-dedent";
import { config } from "../config/config.js";
import { isString } from "../util/is.js";
import type { Field } from "./log/field.js";
import { formatPretty } from "./log/format/pretty.js";
import { Level } from "./log/level.js";
import { stdout } from "./stream.js";

export type PrintOutput<ToString extends boolean | undefined> = ToString extends false | undefined
  ? undefined
  : ToString extends true
    ? string
    : never;

export type PrintOptions<ToString extends boolean> = {
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

  /**
   * Whether to return the formatted string instead of printing it.
   *
   * @default false
   */
  toStr?: ToString;

  /**
   * What to print if --json was passed.
   *
   * @default undefined (print nothing)
   */
  json?: Record<string, Field>;

  /**
   * The options to pass to `boxen`.
   *
   * @default undefined (no box)
   */
  boxen?: BoxenOptions;
};

export type print<ToString extends boolean, Options extends PrintOptions<ToString>> = {
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
  (str: string): PrintOutput<Options["toStr"]>;

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
  (template: TemplateStringsArray, ...values: unknown[]): PrintOutput<Options["toStr"]>;

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
  // eslint-disable-next-line @typescript-eslint/prefer-function-type
  <const ToString extends boolean, const NewOptions extends PrintOptions<ToString>>(
    options: PrintOptions<ToString>,
  ): print<ToString, Options & NewOptions>;
};

export const createPrint = <const ToString extends boolean, const Options extends PrintOptions<ToString>>(
  options: Options,
): print<ToString, Options> => {
  const print = ((
    templateOrOptions: PrintOptions<ToString> | string | TemplateStringsArray,
    ...values: unknown[]
  ): print<ToString, PrintOptions<ToString>> | string | undefined => {
    if (!isString(templateOrOptions) && !Array.isArray(templateOrOptions)) {
      return createPrint({ ...options, ...templateOrOptions });
    }

    if (config.logFormat === "json" && !options.toStr) {
      if (options.json) {
        stdout.write(JSON.stringify(options.json) + "\n");
      }
      return undefined;
    }

    let content = templateOrOptions as string | TemplateStringsArray;
    if (!isString(content)) {
      content = dedent(chalkTemplate(content, ...values));
    }

    if (options.boxen) {
      content = boxen(content, options.boxen);
    }

    if ((options.ensureNewLineAbove ?? false) && !content.startsWith("\n")) {
      content = "\n" + content;
    }

    if ((options.ensureNewLine ?? false) && !content.endsWith("\n")) {
      content += "\n";
    }

    if (options.toStr ?? false) {
      return content;
    }

    if (config.logLevel < Level.PRINT) {
      content = formatPretty(Level.PRINT, "", content, {});
    }

    stdout.write(content);

    return undefined;
  }) as print<ToString, Options>;

  return print;
};

export const print = createPrint({ ensureNewLine: false });
export const println = createPrint({ ensureNewLine: true });

export const sprint = createPrint({ toStr: true, ensureNewLine: false });
export const sprintln = createPrint({ toStr: true, ensureNewLine: true });

export const printTable = <const ToString extends boolean>({
  message,
  headers,
  rows,
  footer,
  borders: borderType = "none",
  spaceY = 0,
  colAligns = [],
  colWidths = [],
  ...printOptions
}: PrintTableOptions<ToString>): PrintOutput<ToString> => {
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

  return createPrint({ ensureNewLine: true, ...printOptions })(output) as PrintOutput<ToString>;
};

export type PrintTableOptions<ToString extends boolean> = PrintOptions<ToString> & {
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
