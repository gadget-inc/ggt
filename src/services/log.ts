/* eslint-disable @typescript-eslint/no-confusing-void-expression */
import { addBreadcrumb as addSentryBreadcrumb } from "@sentry/node";
import Debug from "debug";
import assert from "node:assert";
import { serializeError } from "./errors.js";
import { isFunction } from "./is.js";
import { withExtendedJSON, type JsonifiableObject } from "./json.js";

let longestName = 0;
let longestMessage = 0;

type Log = (msg: Lowercase<string>, fields?: JsonifiableObject) => void;

type Logger = {
  debug: Log;
  info: Log;
  warn: Log;
  error: Log;
  extend(name: string, fields?: Fields): Logger;
};

type Fields = JsonifiableObject | (() => JsonifiableObject);

const thunk = <T>(val: T | (() => T)): (() => T) => {
  if (isFunction(val)) {
    return val;
  }
  return () => val;
};

export const createLogger = (name: string, loggerFields: Fields = {}): Logger => {
  longestName = Math.max(longestName, name.length);
  const baseFields = thunk(loggerFields);

  const createLog = (level: "debug" | "info" | "warn" | "error"): Log => {
    const debug = Debug(`ggt:${name}`);

    return (msg, fields) => {
      longestMessage = Math.max(longestMessage, msg.length);

      fields = { ...baseFields(), ...fields };
      if ("error" in fields) {
        fields.error = serializeError(fields.error);
      }

      withExtendedJSON(() => {
        assert(fields !== undefined);

        if (Object.keys(fields).length === 0) {
          debug("%s%s", " ".repeat(longestName - name.length), msg.padEnd(longestMessage));
        } else {
          debug("%s%s %o", " ".repeat(longestName - name.length), msg.padEnd(longestMessage), fields);
        }
      });

      if (level === "debug") {
        // don't send debug logs to Sentry
        return;
      }

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
