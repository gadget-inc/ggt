import CliTable3 from "cli-table3";
import indentString from "indent-string";
import { dedent } from "ts-dedent";
import { println, type PrintOptions } from "./print.js";
import { sprintln, type SprintOptions } from "./sprint.js";

export type SprintTableOptions = SprintOptions & {
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

export type PrintTableOptions = PrintOptions & SprintTableOptions;

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
