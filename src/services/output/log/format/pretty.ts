import dayjs from "dayjs";
import assert from "node:assert";
import terminalLink from "terminal-link";
import { type Environment } from "../../../app/app.js";

import { config } from "../../../config/config.js";
import { isNil, isObject } from "../../../util/is.js";
import { serializeObjectToHTTPQuery } from "../../../util/querystring.js";
import colors from "../../colors.js";
import { symbol } from "../../symbols.js";
import { Level } from "../level.js";
import type { Formatter } from "./format.js";

export const formatPretty: Formatter = (level, name, msg, fields, timestamp, environment) => {
  return `${formatTimestamp(timestamp)} ${formatLevel(level)} ${formatName(name)}:${formatMessage(msg)}${formatFields(fields, { indent: 2, timestamp, environment })}${NEW_LINE}`;
};

const EMPTY = "";
const SPACE = " ";
const NEW_LINE = "\n";
const COLON = ":";
const QUOTE = "'";

const formatKey = (key: string, indent: number): string => {
  const color = key === "error" ? colors.error : colors.subdued;

  const buf: string[] = [];
  buf.push(NEW_LINE);
  for (let i = 0; i < indent; i++) {
    buf.push(SPACE);
  }
  buf.push(color(key));
  buf.push(color(COLON));

  return buf.join("");
};

const formatValue = (value: string, color: (s: string) => string, indent: number): string => {
  if (!value) {
    return EMPTY;
  }

  const lines = value.split(NEW_LINE);
  if (lines.length === 0) {
    return EMPTY;
  }

  const buf: string[] = [];
  const firstLine = lines.shift();
  assert(!isNil(firstLine), "first line is nil");
  buf.push(color(firstLine));

  // color the rest of the lines
  for (const line of lines) {
    if (!line) {
      continue;
    }

    buf.push(NEW_LINE);
    for (let i = 0; i < indent; i++) {
      buf.push(SPACE);
    }

    buf.push(color(line));
  }

  return buf.join(EMPTY);
};

const getEnvironmentLogsUrl = (environment: Environment, queryParams?: Record<string, unknown>): string => {
  let queryString = "";

  if (queryParams) {
    queryString = serializeObjectToHTTPQuery(queryParams);
  }

  return `https://${environment.application.slug}--${environment.name}.${config.domains.app}/edit/logs${queryString}`;
};

export const defaultLogqlQuery = (environment?: Environment): string => {
  return environment
    ? `{environment_id="${environment.id.toString()}"} | json | level=~"info|warn|error"`
    : '{environment_id=~".+"} | json | level=~"info|warn|error"';
};

const formatFields = (fields: Record<string, unknown>, opts: { indent: number; timestamp?: Date; environment?: Environment }): string => {
  const { indent, environment, timestamp } = opts;

  if (Object.keys(fields).length === 0) {
    return EMPTY;
  }

  const buf: string[] = [];

  // Make sure trace_id is always the first key printed
  if ("trace_id" in fields) {
    buf.push(formatKey("trace_id", indent));
    buf.push(SPACE);
    if (environment && timestamp && terminalLink.isSupported) {
      buf.push(
        terminalLink(
          colors.link(fields["trace_id"] as string),
          getEnvironmentLogsUrl(environment, {
            timeRange: `${timestamp.toISOString()} to now`,
            logql: `${defaultLogqlQuery(environment)} | trace_id="${fields["trace_id"] as string}"`,
          }),
        ),
      );
    } else {
      buf.push(colors.link(fields["trace_id"] as string));
    }
  }

  for (let [key, value] of Object.entries(fields)) {
    if (key === "trace_id") {
      continue;
    }

    buf.push(formatKey(key, indent));

    if (value instanceof Set) {
      value = Array.from(value);
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        buf.push(formatValue(" []", colors.subdued, indent));
        continue;
      }

      value = Object.fromEntries(value.entries());
    }

    if (value instanceof Map) {
      value = Object.fromEntries(value);
    }

    if (isObject(value)) {
      const entries = Object.entries(value);
      if (entries.length === 0) {
        buf.push(formatValue(" {}", colors.subdued, indent));
        continue;
      }

      if (entries.length > 10 && config.logLevel > Level.TRACE && !environment) {
        // truncate objects to 10 keys when not tracing
        value = Object.fromEntries([...entries.slice(0, 10), [symbol.ellipsis, `${entries.length - 10} more`]]);
      }

      buf.push(formatFields(value as Record<string, unknown>, { indent: indent + 2, environment }));
      continue;
    }

    buf.push(SPACE);

    // Don't colorize fields for environment logger
    if (!environment) {
      switch (typeof value) {
        case "string":
          buf.push(
            formatValue(QUOTE + value.replaceAll(NEW_LINE, NEW_LINE + SPACE.repeat(indent + key.length)) + QUOTE, colors.reset, indent),
          );
          break;
        case "number":
          buf.push(formatValue(String(value), colors.yellowBright, indent));
          break;
        case "bigint":
          buf.push(formatValue(String(value) + "n", colors.yellowBright, indent));
          break;
        case "boolean":
          buf.push(formatValue(String(value), colors.green, indent));
          break;
        default:
          buf.push(formatValue(String(value), colors.reset, indent));
          break;
      }
    } else {
      buf.push(formatValue(String(value), colors.reset, indent));
    }
  }

  return buf.join(EMPTY);
};

const formatTimestamp = (timestamp?: Date): string => {
  const date = timestamp ? dayjs(timestamp) : dayjs();
  const ts = date.format("hh:mm:ss");
  return ts;
};

const formatLevel = (level: Level): string => {
  switch (level) {
    case Level.PRINT:
      return colors.bgBlack(colors.body.bold(" PRINT "));
    case Level.TRACE:
      return colors.bgBlue(colors.body.bold(" TRACE "));
    case Level.DEBUG:
      return colors.bgMagenta(colors.body.bold(" DEBUG "));
    case Level.INFO:
      return colors.bgBlue(colors.body.bold(" INFO "));
    case Level.WARN:
      return colors.bgYellow(colors.body.bold(" WARN "));
    case Level.ERROR:
      return colors.bgRed(colors.body.bold(" ERROR "));
    // case "fatal":
    //   return red(colors.bold(level));
  }
};

const formatName = (name: string): string => {
  return colors.body(name);
};

const formatMessage = (msg: unknown): string => {
  if (msg === null || msg === undefined) {
    return EMPTY;
  }

  const msgStr = typeof msg === "string" ? msg : String(msg);
  if (msgStr === "") {
    return EMPTY;
  }
  const lines = msgStr.split(NEW_LINE);
  if (lines.length === 1) {
    return SPACE + colors.body(msgStr);
  }
  return NEW_LINE + lines.map((line) => SPACE + SPACE + line).join(NEW_LINE);
};
