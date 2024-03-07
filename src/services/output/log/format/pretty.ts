import chalk, { Chalk } from "chalk";
import dayjs from "dayjs";
import figures from "figures";
import assert from "node:assert";
import { config } from "../../../config/config.js";
import { env } from "../../../config/env.js";
import { isObject } from "../../../util/is.js";
import { Level } from "../level.js";
import type { Formatter } from "./format.js";

export const formatPretty: Formatter = (level, name, msg, fields) => {
  return `${formatTimestamp()} ${formatLevel(level)} ${formatName(name)}:${formatMessage(msg)}${formatFields(fields)}${NEW_LINE}`;
};

const color = new Chalk({
  // we always turn off colors in tests (FORCE_COLOR=0) so that we get
  // predictable output, but if we're running with logs enabled
  // (GGT_LOG_LEVEL=info), we still want to see colors in our logs
  level: env.testLike && config.logLevel < Level.PRINT ? 3 : chalk.level,
});

const blue = color.hex("#86B5F7");
const blueLight = color.hex("#B2D0FA");
const gray = color.hex("#D6D6D6");
const grayDark = color.hex("#C2C2C2");
const green = color.hex("#9DE6A4");
const greenLight = color.hex("#BEEEC3");
const orange = color.hex("#EEAC78");
const orangeLight = color.hex("#F4C7A4");
const pink = color.hex("#FAACB5");
const red = color.hex("#A64E4E");
const white = color.hex("#FFFFFF");

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

    if (Array.isArray(value)) {
      if (value.length === 0) {
        buf.push(formatValue(" []", gray, indent));
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
        buf.push(formatValue(" {}", gray, indent));
        continue;
      }

      if (entries.length > 10 && config.logLevel > Level.TRACE) {
        // truncate objects to 10 keys when not tracing
        value = Object.fromEntries([...entries.slice(0, 10), [figures.ellipsis, `${entries.length - 10} more`]]);
      }

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

const formatTimestamp = (): string => {
  const ts = dayjs().format("hh:mm:ss");
  return grayDark(ts);
};

const formatLevel = (level: Level): string => {
  switch (level) {
    case Level.PRINT:
      return gray("PRINT");
    case Level.TRACE:
      return blue("TRACE");
    case Level.DEBUG:
      return orange("DEBUG");
    case Level.INFO:
      return green("INFO");
    case Level.WARN:
      return pink("WARN");
    case Level.ERROR:
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
  return NEW_LINE + lines.map((line) => SPACE + SPACE + line).join(NEW_LINE);
};
