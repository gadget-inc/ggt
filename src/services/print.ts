import ansiColors from "ansi-colors";
import chalkTemplate from "chalk-template";
import CliTable3, { type TableConstructorOptions } from "cli-table3";
import levenshtein from "fast-levenshtein";
import assert from "node:assert";
import { dedent } from "ts-dedent";
import { isString } from "./is.js";
import { stdout } from "./stream.js";

export const color = ansiColors;
export const symbol = ansiColors.symbols;

export const sprint = (template: TemplateStringsArray | string, ...values: unknown[]): string => {
  let content = template;
  if (!isString(content)) {
    content = chalkTemplate(content, ...values);
  }
  return dedent(content);
};

export const sprintln = (template: TemplateStringsArray | string, ...values: unknown[]): string => {
  return sprint(template, ...values) + "\n";
};

export const sprintlns = (template: TemplateStringsArray | string, ...values: unknown[]): string => {
  return "\n" + sprintln(template, ...values);
};

export const print = (template: TemplateStringsArray | string, ...values: unknown[]): void => {
  const message = sprint(template, ...values);
  stdout.write(message);
};

export const println = (template: TemplateStringsArray | string, ...values: unknown[]): void => {
  const message = sprintln(template, ...values);
  stdout.write(message);
};

export const printlns = (template: TemplateStringsArray | string, ...values: unknown[]): void => {
  const message = sprintlns(template, ...values);
  stdout.write(message);
};

/**
 * EXAMPLE:
 *    "top-left": "╔",    top: "═",    "top-mid": "╤",    "top-right": "╗",
 *          left: "║",                    middle: "│",          right: "║",
 *    "left-mid": "╟",    mid: "─",    "mid-mid": "┼",    "right-mid": "╢",
 * "bottom-left": "╚", bottom: "═", "bottom-mid": "╧", "bottom-right": "╝",
 */
export const printTable = ({
  rows,
  ...options
}: TableConstructorOptions & {
  rows: string[][];
}): void => {
  const table = new CliTable3({
    ...options,
    style: { head: [], border: [], ...options.style },
    // prettier-ignore
    chars: {
      "top-left": "",    top: "",    "top-mid": "",    "top-right": "",
      "left-mid": "",    mid: "",    "mid-mid": "",    "right-mid": "",
            left: "",                   middle: "",          right: "",
   "bottom-left": "", bottom: "", "bottom-mid": "", "bottom-right": "",
      ...options.chars
  },
  });

  table.push(...rows);

  let output = table.toString();
  if (!options.head || options.head.length === 0) {
    // cli-table3 adds a single space to the first row when there are no
    // headers, so we remove it here
    output = output.slice(1);
  }

  println(output);
};

export const sortBySimilarity = (input: string, options: Iterable<string>): [closest: string, ...sorted: string[]] => {
  const strings = Array.from(options);
  assert(strings.length > 0, "options must not be empty");
  return strings.sort((a, b) => levenshtein.get(a, input) - levenshtein.get(b, input)) as [string, ...string[]];
};
