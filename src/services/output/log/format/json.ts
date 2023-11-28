import assert from "node:assert";
import stripAnsi from "strip-ansi";
import { config } from "../../../config/config.js";
import { isObject, isString } from "../../../util/is.js";
import { Level } from "../level.js";
import type { Formatter } from "./format.js";

export const formatJson: Formatter = (level, name, msg, fields) => {
  return JSON.stringify({ level, name, msg: stripAnsi(msg).trim(), fields: serializeFields(fields) }) + "\n";
};

const serializeFields = (fields: Record<string, unknown>): Record<string, unknown> => {
  const result = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(fields)) {
    result[key] = serializeValue(value);
  }
  return result;
};

const serializeValue = (value: unknown): unknown => {
  if (value instanceof Set) {
    value = Array.from(value);
  }

  if (Array.isArray(value)) {
    if (value.length > 10 && config.logLevel > Level.DEBUG) {
      // truncate arrays to 10 elements when not debugging
      value = value.slice(0, 10);
      assert(Array.isArray(value));
    }
    return value.map(serializeValue);
  }

  if (value instanceof Map) {
    value = Object.fromEntries(value.entries());
  }

  if (isObject(value)) {
    return serializeFields(value as Record<string, unknown>);
  }

  if (isString(value)) {
    return stripAnsi(value).trim();
  }

  return value;
};
