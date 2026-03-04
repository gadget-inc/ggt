import { config } from "../config/config.js";
import { isString } from "../util/is.js";
import type { Field } from "./log/field.js";
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
   * Prints the given string as is, or prints the given content with
   * options.
   *
   * @param strOrOptions - The string to print, or options with content.
   * @example
   * print("Hello, world!");
   * // => "Hello, world!"
   *
   * print({ ensureEmptyLineAbove: true, content: "Hello, world!" });
   * // => "\nHello, world!"
   *
   * @see PrintOptions
   */
  (strOrOptions: string | PrintOptions): void;

  /**
   * Prints the given template string with dedent.
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
   * print`
   *   Hello, ${name}!
   *
   *   How are you?
   * `;
   * // => "Hello, Jane!\n\nHow are you?"
   * ```
   * @see dedent https://github.com/tamino-martinius/node-ts-dedent
   */
  (template: TemplateStringsArray, ...values: unknown[]): void;
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
