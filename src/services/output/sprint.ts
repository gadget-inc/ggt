import type { Options as BoxenOptions } from "boxen";

import boxen from "boxen";
import chalkTemplate from "chalk-template";
import indentString from "indent-string";
import { dedent } from "ts-dedent";

import { isArray, isString } from "../util/is.js";
import { omit } from "../util/object.js";

/**
 * Aligns multi-line interpolated values to their insertion column.
 *
 * When a value contains newlines and sits on a whitespace-only line,
 * continuation lines are indented to match the column position. This
 * mirrors ts-dedent's template-tag behavior (step 5.2) so that dedent
 * computes min-indent correctly across template + interpolated content.
 */
const alignMultilineValues = (strings: TemplateStringsArray, values: unknown[]): unknown[] => {
  return values.map((value, i) => {
    const str = String(value);
    if (!str.includes("\n")) return value;

    const preceding = strings[i];
    const lastNewlineIdx = preceding.lastIndexOf("\n");
    const lastLine = lastNewlineIdx >= 0 ? preceding.slice(lastNewlineIdx + 1) : preceding;

    if (!/^\s+$/.test(lastLine)) return value;

    const lines = str.split("\n");
    return lines
      .map((line, j) => {
        if (j === 0) return line;
        if (line === "") return line;
        return lastLine + line;
      })
      .join("\n");
  });
};

const processTemplate = (strings: TemplateStringsArray, values: unknown[]): string => {
  const aligned = alignMultilineValues(strings, values);
  return dedent(chalkTemplate(strings, ...aligned));
};

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

export type SprintOptionsWithContent = SprintOptions & {
  content: string;
};

export type sprint = {
  (str: string | SprintOptionsWithContent): string;
  (template: TemplateStringsArray, ...values: unknown[]): string;
};

export const isSprintOptions = (value: string | TemplateStringsArray | SprintOptions): value is SprintOptions => {
  return !isString(value) && !isArray(value);
};

export const sprint = ((optionsOrString: SprintOptionsWithContent | string | TemplateStringsArray, ...values: unknown[]): string => {
  let str: string;
  let options: SprintOptions = { ensureNewLine: false, ensureEmptyLineAbove: false, indent: 0 };

  if (isSprintOptions(optionsOrString)) {
    str = optionsOrString.content;
    options = { ...options, ...omit(optionsOrString, ["content"]) };
  } else if (isString(optionsOrString)) {
    str = optionsOrString;
  } else {
    str = processTemplate(optionsOrString, values);
  }

  if (options.ensureEmptyLineAbove && !str.startsWith("\n")) {
    str = "\n" + str;
  }

  if (options.ensureNewLine && !str.endsWith("\n")) {
    str += "\n";
  }

  if (options.boxen) {
    str = boxen(str, options.boxen);
  }

  if (options.indent && options.indent > 0) {
    str = indentString(str, options.indent);
  }

  return str;
}) as sprint;

export const sprintln = ((optionsOrString: SprintOptionsWithContent | string | TemplateStringsArray, ...values: unknown[]): string => {
  if (isSprintOptions(optionsOrString)) {
    return sprint({ ensureNewLine: true, ...optionsOrString });
  } else if (isString(optionsOrString)) {
    return sprint({ ensureNewLine: true, content: optionsOrString });
  } else {
    return sprint({ ensureNewLine: true, content: processTemplate(optionsOrString, values) });
  }
}) as sprint;
