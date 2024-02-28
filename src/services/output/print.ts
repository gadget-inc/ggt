import type { Options as BoxenOptions } from "boxen";
import boxen from "boxen";
import chalkTemplate from "chalk-template";
import CliTable3 from "cli-table3";
import indentString from "indent-string";
import { dedent } from "ts-dedent";
import { config } from "../config/config.js";
import { isArray, isString } from "../util/is.js";
import type { Field } from "./log/field.js";
import { output } from "./output.js";

export type SprintOptions = {
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
  ensureEmptyLineAbove?: boolean;

  /**
   * The number of spaces to indent the text.
   *
   * @default 0
   */
  indent?: number;

  /**
   * Whether to wrap the text in a box.
   *
   * @default undefined (no box)
   */
  boxen?: BoxenOptions;
};

export type sprint = {
  (str: string): string;
  (template: TemplateStringsArray, ...values: unknown[]): string;
  (options: SprintOptions): sprint;
};

const createSprint = (options: SprintOptions): sprint => {
  return ((templateOrOptions: SprintOptions | string | TemplateStringsArray, ...values: unknown[]): sprint | string => {
    if (!(isString(templateOrOptions) || isArray(templateOrOptions))) {
      return createSprint({ ...options, ...templateOrOptions });
    }

    const { ensureNewLine = false, ensureEmptyLineAbove = false, indent = 0, boxen: boxenOptions } = options;

    let str = templateOrOptions as string;
    if (!isString(str)) {
      str = dedent(chalkTemplate(str, ...values));
    }

    if (ensureEmptyLineAbove && !str.startsWith("\n")) {
      str = "\n" + str;
    }

    if (ensureNewLine && !str.endsWith("\n")) {
      str += "\n";
    }

    if (boxenOptions) {
      str = boxen(str, boxenOptions);
    }

    if (indent > 0) {
      str = indentString(str, indent);
    }

    return str;
  }) as sprint;
};

export const sprint = createSprint({ ensureNewLine: false });
export const sprintln = createSprint({ ensureNewLine: true });

export type PrintOptions = SprintOptions & {
  /**
   * What to print if --json was passed.
   *
   * @default undefined (print nothing)
   */
  json?: Record<string, Field>;
};

export type print = {
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
  (str: string): void;

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
  (template: TemplateStringsArray, ...values: unknown[]): void;

  /**
   * Configures print with options before printing the given template
   * string with dedent and chalk-template.
   *
   * @example
   * ```
   * let name = "Jane";
   * print({ ensureEmptyLineAbove: true })`Hello, ${name}!`;
   * // => "\nHello, Jane!"
   *
   * print({ ensureEmptyLineAbove: true })`Hello, {red ${name}}!`;
   * // => "\nHello, \u001b[31mJane\u001b[39m!"
   *
   * print({ ensureEmptyLineAbove: true })`
   *   Hello, {red ${name}}!
   *
   *   How are you?
   * `;
   * // => "\nHello, \u001b[31mJane\u001b[39m!\n\nHow are you?"
   * ```
   * @see PrintOptions
   */
  (options: PrintOptions): print;
};

const createPrint = (options: PrintOptions): print => {
  return ((templateOrOptions: PrintOptions | string | TemplateStringsArray, ...values: unknown[]): print | undefined => {
    if (!(isString(templateOrOptions) || isArray(templateOrOptions))) {
      return createPrint({ ...options, ...templateOrOptions });
    }

    const { json, ...sprintOptions } = options;

    if (config.logFormat === "json") {
      if (json) {
        output.writeStdout(JSON.stringify(json) + "\n");
      }
      return;
    }

    const text = sprint(sprintOptions)(templateOrOptions as TemplateStringsArray, ...values);
    output.writeStdout(text);
    return;
  }) as print;
};

export const print = createPrint({ ensureNewLine: false });
export const println = createPrint({ ensureNewLine: true });

export type SprintTableOptions = PrintOptions & {
  /**
   * The text to print above the table.
   */
  title?: string;

  /**
   * The headers of the table.
   */
  headers?: string[];

  /**
   * The rows of the table.
   */
  rows: string[][];

  /**
   * The text to print below the table.
   */
  footer?: string;

  /**
   * Whether to add an empty line above the body of the table.
   *
   * @default false
   */
  ensureEmptyLineAboveBody?: boolean;

  /**
   * Whether to add an empty line above the footer of the table.
   *
   * @default false
   */
  ensureEmptyLineAboveFooter?: boolean;

  /**
   * The type of borders to use.
   *
   * @default "none"
   */
  borders?: "none" | "thin" | "thick";

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

export const sprintTable = ({
  title,
  headers,
  rows,
  footer,
  ensureEmptyLineAboveBody = false,
  ensureEmptyLineAboveFooter = false,
  borders: borderType = "none",
  colAligns = [],
  colWidths = [],
  indent,
  ...printOptions
}: SprintTableOptions): string => {
  const table = new CliTable3({
    chars: borders[borderType],
    colAligns,
    colWidths,
    head: headers,
    style: { head: [], border: [] },
  });

  table.push(...rows);

  let text = table.toString() + "\n";
  if (borderType === "none") {
    // remove the left padding
    text = dedent(text).slice(1);
  }

  // remove the right padding
  text = text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  if (indent) {
    text = indentString(text, indent);
  }

  if (title) {
    text = sprintln(title) + sprintln({ ensureEmptyLineAbove: ensureEmptyLineAboveBody })(text);
  }

  if (footer) {
    text = sprintln(text) + sprintln({ ensureEmptyLineAbove: ensureEmptyLineAboveFooter })(footer);
  }

  return sprintln(printOptions)(text);
};

export const printTable = (options: SprintTableOptions): void => {
  println(sprintTable(options));
};

// prettier-ignore
const borders = {
  none: {
    "top-left": "", top: "", "top-mid": "", "top-right": "",
    "left-mid": "", mid: "", "mid-mid": "", "right-mid": "",
    left: "", middle: "", right: "",
    "bottom-left": "", bottom: "", "bottom-mid": "", "bottom-right": "",
  },
  thin: {
    "top-left": "┌", top: "─", "top-mid": "┬", "top-right": "┐",
    "left-mid": "├", mid: "─", "mid-mid": "┼", "right-mid": "┤",
    left: "│", middle: "│", right: "│",
    "bottom-left": "└", bottom: "─", "bottom-mid": "┴", "bottom-right": "┘",
  },
  thick: {
    "top-left": "╔", top: "═", "top-mid": "╤", "top-right": "╗",
    left: "║", middle: "│", right: "║",
    "left-mid": "╟", mid: "─", "mid-mid": "┼", "right-mid": "╢",
    "bottom-left": "╚", bottom: "═", "bottom-mid": "╧", "bottom-right": "╝",
  },
};

export const isSprintOptions = <const T extends SprintOptions>(value: string | TemplateStringsArray | SprintOptions): value is T => {
  return !isString(value) && !isArray(value);
};
