import type { SetReturnType } from "type-fest";
import { config } from "../../config/config.js";
import { isString } from "../../util/is.js";
import { sprint, sprintTable, sprintln, type Sprint, type SprintOptions, type SprintTableOptions } from "../sprint.js";
import { stdout } from "../stream.js";
import { formatters } from "./format/format.js";
import { Level } from "./level.js";

export type Print = {
  (options: SprintOptions): SetReturnType<Sprint, void>;
  (template: TemplateStringsArray | string, ...values: unknown[]): void;
};

export type Println = {
  (options: SprintOptions): SetReturnType<Sprint, void>;
  (template?: TemplateStringsArray | string, ...values: unknown[]): void;
};

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
  println: Println;

  /**
   * Prints a table to stdout.
   */
  printTable: (options: SprintTableOptions) => void;

  /**
   * Creates a buffer that can be used to batch multiple print
   * statements together and flush them all at once.
   */
  buffer(): BufferedPrinter;
};

export type BufferedPrinter = Omit<Printer, "buffer"> & {
  /**
   * Flushes the buffer to stdout.
   */
  flush(): void;

  /**
   * Returns the buffer as a string.
   */
  toString(): string;
};

export const createPrinter = ({ name }: { name: string }): Printer => {
  const printMsg = (msg: string): void => {
    if (config.logLevel < Level.PRINT || config.logFormat === "json") {
      msg = formatters[config.logFormat](Level.PRINT, name, msg, {});
    }
    stdout.write(msg);
  };

  return {
    print: ((...args) => {
      // @ts-expect-error - TS doesn't like the overloads here
      const result = sprint(...args);
      if (isString(result)) {
        printMsg(result);
        return;
      }

      // @ts-expect-error - or here
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return (...args) => printMsg(result(...args));
    }) as Print,

    println: ((...args) => {
      // @ts-expect-error - TS doesn't like the overloads here
      const result = sprintln(...args);
      if (isString(result)) {
        printMsg(result);
        return;
      }

      // @ts-expect-error - or here
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return (...args) => printMsg(result(...args));
    }) as Println,

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

      this.println(sprintTable(opts));
    },

    buffer: () => {
      let buf: string[] = [];

      return {
        print: ((...args) => {
          // @ts-expect-error - TS doesn't like the overloads here
          buf.push(sprint(...args));
        }) as Print,
        println: ((...args) => {
          // @ts-expect-error - or here
          buf.push(sprintln(...args));
        }) as Println,
        printTable: (options) => {
          buf.push(sprintTable(options));
        },
        toString: () => {
          return buf.join("");
        },
        flush() {
          for (const msg of buf) {
            stdout.write(msg);
          }
          buf = [];
        },
      };
    },
  };
};
