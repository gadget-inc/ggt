import type { Field } from "./log/field.js";

import { config } from "../config/config.js";
import { isString } from "../util/is.js";
import { output } from "./output.js";
import { isSprintOptions, sprint, type SprintOptionsWithContent } from "./sprint.js";

export type PrintOptions = SprintOptionsWithContent & {
  /**
   * What to print if --json was passed.
   *
   * @default undefined (print nothing)
   */
  json?: Field;
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
  (options: PrintOptions): void;
};

export const print = ((optionsOrString: PrintOptions | string | TemplateStringsArray, ...values: unknown[]): void => {
  if (config.logFormat === "json") {
    if (isSprintOptions(optionsOrString) && optionsOrString.json) {
      output.writeStdout(JSON.stringify(optionsOrString.json) + "\n");
    }
    return;
  }

  const text = sprint(optionsOrString as TemplateStringsArray, ...values);
  output.writeStdout(text);
}) as print;

export const println = ((optionsOrString: PrintOptions | string | TemplateStringsArray, ...values: unknown[]): void => {
  if (isSprintOptions(optionsOrString)) {
    print({ ensureNewLine: true, ...optionsOrString });
  } else if (isString(optionsOrString)) {
    print({ ensureNewLine: true, content: optionsOrString });
  } else {
    print({ ensureNewLine: true, content: sprint(optionsOrString, ...values) });
  }
}) as print;
