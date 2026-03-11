import type { Environment } from "../../app/app.js";
import { hidden, type FlagsDefinition, type FlagsResult } from "../../command/flag.js";
import { config } from "../../config/config.js";
import { env } from "../../config/env.js";
import { filterByPrefix } from "../../util/collection.js";
import { unthunk, type Thunk } from "../../util/function.js";
import { serializeError } from "../../util/object.js";
import { output } from "../output.js";
import { addSentryBreadcrumb } from "../sentry.js";
import { sprint } from "../sprint.js";
import type { Fields } from "./field.js";
import { formatters } from "./format/format.js";
import { Level, levels, parseLevel } from "./level.js";

export const LoggingFlags = {
  "--log-level": {
    type: (value) => parseLevel(value, Level.INFO),
    alias: ["-l", hidden("-ll")],
    default: Level.INFO,
    description: "Minimum log level to display",
    valueName: "level",
    details: sprint`
      One of: trace, debug, info, warn, error. Defaults to info. Use trace or
      debug for verbose troubleshooting output.
    `,
    complete: async (_ctx, partial) => {
      return filterByPrefix(levels, partial);
    },
  },
  "--my-logs": {
    type: Boolean,
    alias: "-m",
    description: "Show only logs emitted by your code",
    details: "Filters out built-in platform logs, showing only logs sourced from your own code.",
  },
} satisfies FlagsDefinition;

export type LoggingFlags = typeof LoggingFlags;
export type LoggingFlagsResult = FlagsResult<LoggingFlags>;

type StructuredLog = (msg: Lowercase<string>, fields?: Fields, devFields?: Fields) => void;

export type StructuredLogger = {
  trace: StructuredLog;
  debug: StructuredLog;
  info: StructuredLog;
  warn: StructuredLog;
  error: StructuredLog;
};

export type StructuredLoggerOptions = {
  /**
   * The name of logger.
   */
  name: string;

  /**
   * Fields to add to every message logged by the logger.
   */
  fields?: Thunk<Fields>;

  /**
   * Fields to add to every message logged by the logger only in
   * development or test environments.
   */
  devFields?: Thunk<Fields>;
};

type StructuredEnvironmentLog = (level: string, name: string, msg: Lowercase<string>, fields?: Fields, timestamp?: Date) => void;

// Less bulky mapping of log levels, specifically for environment logs.
const levelMap: Partial<Record<string, Level>> = {
  trace: Level.TRACE,
  debug: Level.DEBUG,
  info: Level.INFO,
  warn: Level.WARN,
  error: Level.ERROR,
};

export const createEnvironmentStructuredLogger = (environment: Environment): StructuredEnvironmentLog => {
  return (level, name, msg, messageFields, timestamp) => {
    const fields = { ...messageFields };

    if ("error" in fields) {
      fields.error = serializeError(fields.error);
    }

    if ("reason" in fields) {
      fields.reason = serializeError(fields.reason);
    }

    const format = formatters[config.logFormat];
    const parsedLevel = levelMap[level.toLowerCase()];
    // Unknown level strings from environment adapters are silently treated as INFO — crashing on unrecognized levels would break log streaming for apps that emit custom levels.
    const resolvedLevel = parsedLevel ?? Level.INFO;

    output.writeStdout(format(resolvedLevel, name, msg, fields, timestamp, environment));
  };
};

export const createStructuredLogger = ({
  name,
  fields: loggerFields = {},
  devFields: devLoggerFields = {},
}: StructuredLoggerOptions): StructuredLogger => {
  const createStructuredLog = (level: Level): StructuredLog => {
    return (msg, messageFields, devMessageFields) => {
      const shouldLog = level >= config.logLevel;
      const shouldSendToSentry = level >= Level.INFO;
      if (!shouldLog && !shouldSendToSentry) {
        return;
      }

      const fields = { ...unthunk(loggerFields), ...messageFields };
      if (env.developmentOrTestLike) {
        Object.assign(fields, unthunk(devLoggerFields), devMessageFields);
      }

      if ("error" in fields) {
        fields.error = serializeError(fields.error);
      }

      if ("reason" in fields) {
        fields.reason = serializeError(fields.reason);
      }

      if (shouldLog) {
        const format = formatters[config.logFormat];
        output.writeStderr(format(level, name, msg, fields));
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
