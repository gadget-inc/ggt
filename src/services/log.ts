import { addBreadcrumb as addSentryBreadcrumb } from "@sentry/node";
import chalk from "chalk";
import dayjs from "dayjs";
import assert from "node:assert";
import { config } from "./config.js";
import { serializeError } from "./errors.js";
import { isFunction, isObject } from "./is.js";
import { type JsonifiableObject } from "./json.js";
import { noop } from "./noop.js";
import { stderr } from "./stream.js";

type Level = "debug" | "info" | "warn" | "error";
type Fields = JsonifiableObject | (() => JsonifiableObject);
type Log = (msg: Lowercase<string>, fields?: JsonifiableObject) => void;

export type Logger = {
  debug: Log;
  info: Log;
  warn: Log;
  error: Log;
  extend(name: string, fields?: Fields): Logger;
};

const thunk = <T>(val: T | (() => T)): (() => T) => {
  if (isFunction(val)) {
    return val;
  }
  return () => val;
};

export const createLogger = (name: string, loggerFields: Fields = {}): Logger => {
  if (!config.debug) {
    return noopLogger;
  }

  const baseFields = thunk(loggerFields);

  const createLog = (level: Level): Log => {
    return (msg, fields) => {
      fields = { ...baseFields(), ...fields };
      if ("error" in fields) {
        fields.error = serializeError(fields.error);
      }

      const ts = dayjs().format("hh:mm:ss.SSS");
      stderr.write(`${grayDark(ts)} ${formatLevel(level)} ${formatName(name)}:${formatMessage(msg)}`);
      stderr.write(formatFields(fields));
      stderr.write(NEW_LINE);

      if (level === "debug") {
        // don't send debug logs to Sentry
        return;
      }

      // TODO: do this in noop logger
      addSentryBreadcrumb({
        level: level === "warn" ? "warning" : level,
        message: msg,
        data: fields,
      });
    };
  };

  return {
    debug: createLog("debug"),
    info: createLog("info"),
    warn: createLog("warn"),
    error: createLog("error"),
    extend: (name, fields?: Fields) => createLogger(name, () => ({ ...baseFields(), ...thunk(fields)() })),
  };
};

// const blue = chalk.hex("#86B5F7");
const blueLight = chalk.hex("#B2D0FA");
const gray = chalk.hex("#D6D6D6");
const grayDark = chalk.hex("#C2C2C2");
const green = chalk.hex("#9DE6A4");
const greenLight = chalk.hex("#BEEEC3");
const orange = chalk.hex("#EEAC78");
const orangeLight = chalk.hex("#F4C7A4");
const pink = chalk.hex("#FAACB5");
const red = chalk.hex("#A64E4E");
const white = chalk.hex("#FFFFFF");

const EMPTY = "";
const SPACE = " ";
const NEW_LINE = "\n";
const COLON = ":";
const QUOTE = "'";

const formatKey = (key: string, indent: number): string => {
  const color = key === "error" ? red : gray;

  const buf: string[] = [];
  buf.push(NEW_LINE);
  for (let i = 0; i < indent; i++) {
    buf.push(SPACE);
  }
  buf.push(color(key));
  buf.push(COLON);

  return buf.join("");
};

const formatValue = (value: string, color: (s: string) => string, indent: number): string => {
  const lines = value.split(NEW_LINE);
  if (lines.length === 0) {
    return EMPTY;
  }

  const buf: string[] = [];
  const firstLine = lines.shift();
  assert(firstLine);
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

const formatFields = (fields: Record<string, unknown>, indent = 2): string => {
  if (Object.keys(fields).length === 0) {
    return EMPTY;
  }

  const buf: string[] = [];
  for (let [key, value] of Object.entries(fields)) {
    buf.push(formatKey(key, indent));

    if (value instanceof Set) {
      value = Array.from(value);
    }

    if (value instanceof Map) {
      value = Object.fromEntries(value.entries());
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        buf.push(formatValue(" []", gray, indent));
        continue;
      }

      value = Object.fromEntries(value.entries());
    }

    if (isObject(value)) {
      buf.push(formatFields(value as Record<string, unknown>, indent + 2));
      continue;
    }

    buf.push(SPACE);

    switch (typeof value) {
      case "string":
        buf.push(formatValue(QUOTE + value.replaceAll(NEW_LINE, NEW_LINE + SPACE.repeat(indent + key.length)) + QUOTE, blueLight, indent));
        break;
      case "number":
        buf.push(formatValue(String(value), orangeLight, indent));
        break;
      case "bigint":
        buf.push(formatValue(String(value) + "n", orangeLight, indent));
        break;
      case "boolean":
        buf.push(formatValue(String(value), greenLight, indent));
        break;
      default:
        buf.push(formatValue(String(value), white, indent));
        break;
    }
  }

  return buf.join(EMPTY);
};

const formatLevel = (level: Level): string => {
  switch (level) {
    // case "trace":
    //   return blue(level);
    case "debug":
      return orange("DEBUG");
    case "info":
      return green("INFO");
    case "warn":
      return pink("WARN");
    case "error":
      return red("ERROR");
    // case "fatal":
    //   return red(colors.bold(level));
  }
};

const formatName = (name: string): string => {
  return white(name);
};

const formatMessage = (msg: string): string => {
  const lines = msg.split(NEW_LINE);
  if (lines.length === 1) {
    return SPACE + white(msg);
  }

  const buf = [];
  for (const line of lines) {
    buf.push(SPACE, SPACE);
    buf.push(chalk.dim(line));
    buf.push(NEW_LINE);
  }
  return buf.join(EMPTY);
};

const noopLogger: Logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  extend: () => noopLogger,
};
