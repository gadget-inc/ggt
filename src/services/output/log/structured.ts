import { addBreadcrumb as addSentryBreadcrumb } from "@sentry/node";
import { config } from "../../config/config.js";
import { env } from "../../config/env.js";
import { unthunk, type Thunk } from "../../util/function.js";
import { serializeError } from "../../util/object.js";
import { stderr } from "../stream.js";
import type { Fields } from "./field.js";
import { formatters } from "./format/format.js";
import { Level } from "./level.js";

type StructuredLog = (msg: Lowercase<string>, fields?: Fields, devFields?: Fields) => void;

export type StructuredLogger = {
  trace: StructuredLog;
  debug: StructuredLog;
  info: StructuredLog;
  warn: StructuredLog;
  error: StructuredLog;
};

export const createStructuredLogger = ({ name, fields: loggerFields = {} }: { name: string; fields?: Thunk<Fields> }): StructuredLogger => {
  const createStructuredLog = (level: Level): StructuredLog => {
    return (msg, messageFields, devMessageFields) => {
      const shouldLog = level >= config.logLevel;
      const shouldSendToSentry = level >= Level.INFO;
      if (!shouldLog && !shouldSendToSentry) {
        return;
      }

      const fields = { ...unthunk(loggerFields), ...messageFields };
      if (env.developmentOrTestLike) {
        Object.assign(fields, devMessageFields);
      }

      if ("error" in fields) {
        fields.error = serializeError(fields.error);
      }

      if ("reason" in fields) {
        fields.reason = serializeError(fields.reason);
      }

      if (shouldLog) {
        const format = formatters[config.logFormat];
        stderr.write(format(level, name, msg, fields));
      }

      if (shouldSendToSentry) {
        addSentryBreadcrumb({ level: "log", message: msg, data: fields });
      }
    };
  };

  return {
    trace: createStructuredLog(Level.TRACE),
    debug: createStructuredLog(Level.DEBUG),
    info: createStructuredLog(Level.INFO),
    warn: createStructuredLog(Level.WARN),
    error: createStructuredLog(Level.ERROR),
  };
};
