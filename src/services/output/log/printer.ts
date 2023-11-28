import CliTable3 from "cli-table3";
import { dedent } from "ts-dedent";
import { config } from "../../config/config.js";
import { sprint, sprintln, sprintlns, type Sprint } from "../sprint.js";
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
  printTable: (options: {
    /**
     * The message to print above the table.
     */
    message: string;

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
  }) => void;
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
    printlns: createPrint(sprintlns),
    printTable({ message, rows, footer, borders: borderType = "none", headers }) {
      if (config.logFormat === "json") {
        stdout.write(formatters.json(Level.PRINT, name, message, { headers, rows, footer }));
        return;
      }

      const table = new CliTable3({
        style: { head: [], border: [] },
        head: headers,
        chars: borders[borderType],
      });

      table.push(...rows);

      let output = message + "\n";
      if (borderType === "none") {
        // remove the left padding
        output += dedent(table.toString()).slice(1);
      } else {
        output += table.toString();
      }

      if (footer) {
        output += "\n" + footer;
      }

      this.printlns(output);
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
