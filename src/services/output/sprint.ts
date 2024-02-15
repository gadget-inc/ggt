/* eslint-disable func-style */
/* eslint-disable jsdoc/require-jsdoc */
import type { Options as BoxenOptions } from "boxen";
import boxen from "boxen";
import chalkTemplate from "chalk-template";
import CliTable3 from "cli-table3";
import { dedent } from "ts-dedent";
import { isNil, isString } from "../util/is.js";

export type Sprint = (template: TemplateStringsArray | string, ...values: unknown[]) => string;
export type Sprintln = (template?: TemplateStringsArray | string, ...values: unknown[]) => string;

export type SprintOptions = {
  dedent?: boolean;
  marginTop?: boolean;
  marginBottom?: boolean;
};

const createSprint = (options: SprintOptions): Sprint => {
  return (template, ...values) => {
    let content = template;
    if (!isString(content)) {
      content = chalkTemplate(content, ...values);
    }

    if (options.dedent ?? true) {
      content = dedent(content);
    }

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

export function sprint(options: SprintOptions): Sprint;
export function sprint(template: TemplateStringsArray | string, ...values: unknown[]): string;
export function sprint(templateOrOptions: SprintOptions | TemplateStringsArray | string, ...values: unknown[]): Sprint | string {
  if (isString(templateOrOptions) || Array.isArray(templateOrOptions)) {
    return defaultSprint(templateOrOptions as string | TemplateStringsArray, ...values);
  }
  return createSprint(templateOrOptions as SprintOptions);
}

export function sprintln(options: SprintOptions): Sprintln;
export function sprintln(template?: TemplateStringsArray | string, ...values: unknown[]): string;
export function sprintln(templateOrOptions?: SprintOptions | TemplateStringsArray | string, ...values: unknown[]): Sprintln | string {
  if (isNil(templateOrOptions)) {
    return "\n";
  }

  if (isString(templateOrOptions) || Array.isArray(templateOrOptions)) {
    return defaultSprint(templateOrOptions as string | TemplateStringsArray, ...values) + "\n";
  }

  return (template?: TemplateStringsArray | string, ...values: unknown[]): string => {
    if (isNil(template)) {
      return "\n";
    }

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
