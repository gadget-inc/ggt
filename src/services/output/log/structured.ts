import assert from "node:assert";
import type { Environment } from "../../app/app.js";
import type { ArgsDefinition, ArgsDefinitionResult } from "../../command/arg.js";
import { config } from "../../config/config.js";
import { env } from "../../config/env.js";
import { unthunk, type Thunk } from "../../util/function.js";
import { serializeError } from "../../util/object.js";
import { output } from "../output.js";
import { addSentryBreadcrumb } from "../sentry.js";
import type { Fields } from "./field.js";
import { formatters } from "./format/format.js";
import { Level, parseLevel } from "./level.js";

export const LoggingArgs = {
  "--log-level": { type: (value) => parseLevel(value, Level.INFO), alias: ["-ll"], default: Level.INFO },
  "--my-logs": { type: Boolean },
} satisfies ArgsDefinition;

export type LoggingArgs = typeof LoggingArgs;
export type LoggingArgsResult = ArgsDefinitionResult<LoggingArgs>;

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
const levelMap: Record<string, Level> = {
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
    assert(parsedLevel, `Unknown level: ${level}`);

    output.writeStdout(format(parsedLevel, name, msg, fields, timestamp, environment));
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
