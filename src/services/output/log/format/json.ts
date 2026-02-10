import stripAnsi from "strip-ansi";

import type { Formatter } from "./format.js";

import { isObject, isString } from "../../../util/is.js";

export const formatJson: Formatter = (level, name, msg, fields) => {
  if (msg) {
    msg = stripAnsi(msg).trim();
  } else {
    msg = "";
  }
  return JSON.stringify({ level, name, msg, fields: serializeFields(fields) }) + "\n";
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
