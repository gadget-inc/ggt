import { config } from "../../config/config.js";
import { sprint, sprintTable, sprintln, sprintln2, sprintlns, sprintlns2, type Sprint, type SprintTableOptions } from "../sprint.js";
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
   * Prints a message to stdout surrounded by newlines and followed by a newline.
   *
   * @example
   * logger.printlns2("Hello, world!");
   * // \n
   * // Hello, world!\n
   * // \n
   */
  printlns2: Print;

  /**
   * Prints a table to stdout.
   */
  printTable: (options: SprintTableOptions) => void;
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
    printlns2: createPrint(sprintlns2),
    printTable(opts) {
      if (config.logFormat === "json") {
        stdout.write(
          formatters.json(Level.PRINT, name, opts.message || opts.boxen?.title || "table", {
            headers: opts.headers,
            rows: opts.rows,
            footer: opts.footer,
          }),
        );
        return;
      }

      this.println2(sprintTable(opts));
    },
  };
};
