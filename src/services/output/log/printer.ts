import type { Options as BoxenOptions } from "boxen";
import boxen from "boxen";
import CliTable3 from "cli-table3";
import { dedent } from "ts-dedent";
import { config } from "../../config/config.js";
import { sprint, sprintln, sprintln2, sprintlns, type Sprint } from "../sprint.js";
import { stdout } from "../stream.js";
import { formatters } from "./format/format.js";
import { Level } from "./level.js";

type Print = (template: TemplateStringsArray | string, ...values: unknown[]) => void;

export type Printer = {
  /**
   * Prints a message to stdout.
   *
   * @example
   * logger.print("Hello, world!");
   * // Hello, world!
   */
  print: Print;

  /**
   * Prints a message to stdout followed by a newline.
   *
   * @example
   * logger.println("Hello, world!");
   * // Hello, world!\n
   */
  println: Print;

  /**
   * Prints a message to stdout followed by two newlines.
   *
   * @example
   * logger.println2("Hello, world!");
   * // Hello, world!\n
   * // \n
   */
  println2: Print;

  /**
   * Prints a message to stdout surrounded by newlines.
   *
   * @example
   * logger.printlns("Hello, world!");
   * // \n
   * // Hello, world!\n
   */
  printlns: Print;

  /**
   * Prints a table to stdout.
   */
  printTable: (options: PrintTableOptions) => void;
};

export type PrintTableOptions = {
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
   * @default "none"
   */
  borders?: "none" | "thin" | "thick";

  /**
   * The amount of empty lines to print between the message, table,
   * and footer.
   * @default 0
   */
  spaceY?: number;

  /**
   * The alignment of the content in each column.
   * @default [] (left-aligned)
   */
  colAligns?: ("left" | "center" | "right")[];

  /**
   * The width of each column.
   * @default [] (auto-sized)
   */
  colWidths?: number[];

  /**
   * The options to pass to `boxen`.
   * @default undefined (no box)
   */
  boxen?: BoxenOptions;
};

export const createPrinter = ({ name }: { name: string }): Printer => {
  const createPrint = (sprinter: Sprint): Print => {
    return (template, ...values) => {
      let msg = sprinter(template, ...values);
      if (config.logLevel < Level.PRINT || config.logFormat === "json") {
        msg = formatters[config.logFormat](Level.PRINT, name, msg, {});
      }
      stdout.write(msg);
    };
  };

  return {
    print: createPrint(sprint),
    println: createPrint(sprintln),
    println2: createPrint(sprintln2),
    printlns: createPrint(sprintlns),
    printTable({
      message,
      headers,
      rows,
      footer,
      borders: borderType = "none",
      spaceY = 0,
      colAligns = [],
      colWidths = [],
      boxen: boxenOptions,
    }) {
      if (config.logFormat === "json") {
        stdout.write(formatters.json(Level.PRINT, name, message || boxenOptions?.title || "table", { headers, rows, footer }));
        return;
      }

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

      this.println2(output);
    },
  };
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
