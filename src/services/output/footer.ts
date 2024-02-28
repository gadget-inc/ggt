import { isString } from "../util/is.js";
import { output } from "./output.js";
import { isSprintOptions, sprint, type SprintOptions } from "./print.js";

export type footer = {
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
   * @see SprintOptions
   */
  (options: SprintOptions): footer;

  // TODO
  clear(): void;
};

const createFooter = (options: SprintOptions): footer => {
  return ((optionsOrString: SprintOptions | string | TemplateStringsArray, ...values: unknown[]): footer | undefined => {
    if (isSprintOptions(optionsOrString)) {
      return createFooter({ ...options, ...optionsOrString });
    }

    // const text = sprintln(sprintOptions)(templateOrOptions as TemplateStringsArray, ...values);
    let str = optionsOrString as string;
    if (!isString(str)) {
      str = sprint({ ensureNewLine: true, ...options })(optionsOrString as TemplateStringsArray, ...values);
    }

    output.updateFooter(str);

    return;
  }) as footer;
};

export const footer = createFooter({});
