import type { Options as BoxenOptions } from "boxen";
import boxen from "boxen";
import { dedent } from "ts-dedent";

import { isArray, isString } from "../util/is.js";
import { omit } from "../util/object.js";

/**
 * Aligns multi-line interpolated values to their insertion column.
 *
 * When a value contains newlines and sits on a whitespace-only line,
 * continuation lines are indented to match the column position. This
 * mirrors ts-dedent's template-tag behavior so that dedent
 * computes min-indent correctly across template + interpolated content.
 *
 * @remarks Callers must place multi-line interpolated values on a
 * whitespace-only line (e.g. `sprint\`  Label: ${value}\``). If the
 * preceding text contains non-whitespace characters the alignment is
 * silently skipped and the value is returned unchanged.
 */
const alignMultilineValues = (strings: TemplateStringsArray, values: unknown[]): unknown[] => {
  return values.map((value, i) => {
    if (typeof value !== "string") return value;

    if (!value.includes("\n")) return value;

    const preceding = strings[i];
    const lastNewlineIdx = preceding.lastIndexOf("\n");
    const lastLine = lastNewlineIdx >= 0 ? preceding.slice(lastNewlineIdx + 1) : preceding;

    if (/\S/.test(lastLine)) return value;

    const lines = value.split("\n");
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
  // oxlint-disable-next-line no-base-to-string -- intentional: arbitrary template values are coerced to string, same as chalk-template did internally
  const joined = strings.reduce((acc, str, i) => acc + (i > 0 ? String(aligned[i - 1] ?? "") : "") + str, "");
  return dedent(joined);
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
  let options: SprintOptions = { ensureNewLine: false, ensureEmptyLineAbove: false };

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
