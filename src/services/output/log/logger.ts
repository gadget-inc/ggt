import { unthunk } from "../../util/function.js";
import { sprint, sprintTable, sprintln, sprintln2, sprintlns, sprintlns2 } from "../sprint.js";
import { stdout } from "../stream.js";
import { createPrinter, type Printer } from "./printer.js";
import { createStructuredLogger, type StructuredLogger, type StructuredLoggerOptions } from "./structured.js";

export type Logger = StructuredLogger &
  Printer & {
    /**
     * Creates a child logger with the given options. The child logger
     * inherits the name and fields of the parent logger.
     *
     * @param options
     */
    child(options: Partial<StructuredLoggerOptions>): Logger;

    /**
     * Creates a buffer that can be used to batch multiple print
     * statements together. Call `flush` to print all the buffered
     * messages to stdout in a single write.
     */
    buffer(): Printer & { flush(): void };
  };

/**
 * Creates a {@linkcode Logger} with the given name and fields.
 *
 * Use the {@linkcode Printer} methods to print messages to stdout for
 * end users to read.
 *
 * Use the {@linkcode StructuredLogger} methods to print structured
 * messages to stderr for developers to read. These messages are only
 * printed when the `GGT_LOG_LEVEL` is greater than or equal to the
 * level of the message.
 *
 * @example
 * const logger = createLogger({ name: "my-logger" });
 * logger.info("printing hello world", { foo: "bar" });
 * // stderr
 * // 12:00:00 INFO my-logger: printing hello world
 * //   foo: "bar"
 * //
 * // stderr w/ --json
 * // {"level":3,"name":"my-logger","msg":"printing hello world","fields":{"foo":"bar"}}
 *
 * logger.println("Hello, world!");
 * // stdout
 * // Hello, world!
 * //
 * // stdout w/ --json
 * // {"level":6,"name":"my-logger","msg":"Hello, world!"}
 */
export const createLogger = ({ name, fields: loggerFields, devFields: loggerDevFields }: StructuredLoggerOptions): Logger => {
  return {
    ...createPrinter({ name }),
    ...createStructuredLogger({ name, fields: loggerFields, devFields: loggerDevFields }),

    child: ({ name: childName, fields: childFields, devFields: childDevFields }) => {
      return createLogger({
        name: childName || name,
        fields: () => ({ ...unthunk(loggerFields), ...unthunk(childFields) }),
        devFields: { ...unthunk(loggerDevFields), ...unthunk(childDevFields) },
      });
    },

    buffer: () => {
      let buf: string[] = [];

      return {
        print: (...args) => buf.push(sprint(...args)),
        println: (...args) => buf.push(sprintln(...args)),
        println2: (...args) => buf.push(sprintln2(...args)),
        printlns: (...args) => buf.push(sprintlns(...args)),
        printlns2: (...args) => buf.push(sprintlns2(...args)),
        printTable: (options) => buf.push(sprintTable(options)),
        flush() {
          stdout.write(buf.join(""));
          buf = [];
        },
      };
    },
  };
};
