import type { Options as BoxenOptions } from "boxen";
import boxen from "boxen";
import chalkTemplate from "chalk-template";
import CliTable3 from "cli-table3";
import { dedent } from "ts-dedent";
import { isString } from "../util/is.js";

export type Sprinter = {
  (str: string): string;
  (template: TemplateStringsArray, ...values: unknown[]): string;
};

export type Sprint = {
  /**
   * Formats the given string with dedent.
   *
   * @param str - The string to dedent.
   * @see dedent https://github.com/tamino-martinius/node-ts-dedent
   * @example
   * sprint("Hello, world!");
   * // => "Hello, world!"
   * sprint(`
   *   Hello, world!
   *
   *   How are you?
   * `);
   * // => "Hello, world!\n\nHow are you?"
   */
  (str?: string): string;

  /**
   * Formats the given template string with dedent and chalk-template.
   *
   * @param template - The template string to format.
   * @param values - The values to interpolate into the template.
   * @see dedent https://github.com/tamino-martinius/node-ts-dedent
   * @see chalk-template https://github.com/chalk/chalk-template
   * @example
   * let name = "Jane";
   * sprint`Hello, ${name}!`;
   * // => "Hello, Jane!"
   * sprint`Hello, {red ${name}}!`;
   * // => "Hello, \u001b[31mJane\u001b[39m!"
   * sprint`
   *   Hello, {red ${name}}!
   *
   *   How are you?
   * `;
   * // => "Hello, \u001b[31mJane\u001b[39m!\n\nHow are you?"
   */
  (template: TemplateStringsArray, ...values: unknown[]): string;

  /**
   * Configures sprint with options before formatting the given template
   * string with dedent and chalk-template.
   *
   * @see SprintOptions
   * @example
   * let name = "Jane";
   * sprint({ marginTop: true })`Hello, ${name}!`;
   * // => "\nHello, Jane!"
   *
   * sprint({ marginTop: true })`Hello, {red ${name}}!`;
   * // => "\nHello, \u001b[31mJane\u001b[39m!"
   *
   * sprint({ marginTop: true })`
   *   Hello, {red ${name}}!
   *
   *   How are you?
   * `;
   * // => "\nHello, \u001b[31mJane\u001b[39m!\n\nHow are you?"
   */
  // eslint-disable-next-line @typescript-eslint/prefer-function-type
  (options: SprintOptions): Sprinter;
};

export type SprintOptions = {
  /**
   * Whether to ensure there is a space (empty line) above the content.
   *
   * @default false
   */
  marginTop?: boolean;

  /**
   * Whether to ensure there is a space (empty line) below the content.
   *
   * @default false
   */
  marginBottom?: boolean;
};

export const sprint = ((templateOrOptions: SprintOptions | TemplateStringsArray | string, ...values: unknown[]): Sprinter | string => {
  if (isString(templateOrOptions) || Array.isArray(templateOrOptions)) {
    return defaultSprint(templateOrOptions as string | TemplateStringsArray, ...values);
  }

  return createSprint(templateOrOptions as SprintOptions);
}) as Sprint;

export function sprintln(str?: string): string;
export function sprintln(template?: TemplateStringsArray, ...values: unknown[]): string;
export function sprintln(options: SprintOptions): Sprintln;
export function sprintln(templateOrOptions?: SprintOptions | TemplateStringsArray | string, ...values: unknown[]): Sprintln | string {
  templateOrOptions ??= "";

  if (isString(templateOrOptions) || Array.isArray(templateOrOptions)) {
    return defaultSprint(templateOrOptions as string | TemplateStringsArray, ...values) + "\n";
  }

  return (template?: TemplateStringsArray | string, ...values: unknown[]): string => {
    template ??= "";
    return createSprint(templateOrOptions as SprintOptions)(template, ...values) + "\n";
  };
}

export const sprintTable = ({
  message,
  headers,
  rows,
  footer,
  borders: borderType = "none",
  spaceY = 0,
  colAligns = [],
  colWidths = [],
  boxen: boxenOptions,
}: SprintTableOptions): string => {
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

  if (boxenOptions) {
    output = boxen(output, boxenOptions);
  }

  return output;
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

export type SprintTableOptions = {
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

  /**
   * The options to pass to `boxen`.
   *
   * @default undefined (no box)
   */
  boxen?: BoxenOptions;
};

const createSprint = (options: SprintOptions): Sprinter => {
  return (template, ...values) => {
    let content = template;
    if (!isString(content)) {
      content = chalkTemplate(content, ...values);
    }

    content = dedent(content);

    if (options.marginTop ?? false) {
      content = "\n" + content;
    }

    if (options.marginBottom ?? false) {
      content += "\n";
    }

    return content;
  };
};

const defaultSprint = createSprint({});
