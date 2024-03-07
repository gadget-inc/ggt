import type { Options as BoxenOptions } from "boxen";
import boxen from "boxen";
import chalkTemplate from "chalk-template";
import indentString from "indent-string";
import { dedent } from "ts-dedent";
import { isArray, isString } from "../util/is.js";

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

export const isSprintOptions = <const T extends SprintOptions>(value: string | TemplateStringsArray | SprintOptions): value is T => {
  return !isString(value) && !isArray(value);
};

const createSprint = (options: SprintOptions): sprint => {
  return ((optionsOrString: SprintOptions | string | TemplateStringsArray, ...values: unknown[]): sprint | string => {
    if (isSprintOptions(optionsOrString)) {
      return createSprint({ ...options, ...optionsOrString });
    }

    const { ensureNewLine = false, ensureEmptyLineAbove = false, indent = 0, boxen: boxenOptions } = options;

    let str = optionsOrString as string;
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
