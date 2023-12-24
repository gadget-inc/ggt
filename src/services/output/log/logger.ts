import { unthunk, type Thunk } from "../../util/function.js";
import type { Fields } from "./field.js";
import { createPrinter, type Printer } from "./printer.js";
import { createStructuredLogger, type StructuredLogger } from "./structured.js";

export type Logger = StructuredLogger &
  Printer & {
    child(options: { name?: string; fields?: Thunk<Fields> }): Logger;
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
 * logger.print("Hello, world!");
 */
export const createLogger = ({ name, fields: loggerFields = {} }: { name: string; fields?: Thunk<Fields> }): Logger => {
  return {
    ...createPrinter({ name }),
    ...createStructuredLogger({ name, fields: loggerFields }),
    child: ({ name: childName, fields: childFields }) => {
      return createLogger({ name: childName || name, fields: () => ({ ...unthunk(loggerFields), ...unthunk(childFields) }) });
    },
  };
};
