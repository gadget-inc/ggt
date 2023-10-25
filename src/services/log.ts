/* eslint-disable @typescript-eslint/no-confusing-void-expression */
import { addBreadcrumb as addSentryBreadcrumb } from "@sentry/node";
import Debug from "debug";
import { isEmpty, isFunction, padEnd, repeat } from "lodash";
import type { Jsonifiable } from "type-fest";
import { serializeError } from "./errors.js";

type JsonifiableObject = { [Key in string]?: Jsonifiable } | { toJSON: () => Jsonifiable } | { error?: unknown };

let longestName = 0;
let longestMessage = 0;

export const createLogger = (name: string, fields: JsonifiableObject | (() => JsonifiableObject) = {}) => {
  longestName = Math.max(longestName, name.length);
  const baseFields = isFunction(fields) ? fields : () => fields;

  const createLog = (level: "debug" | "info" | "warn" | "error") => {
    const debug = Debug(`ggt:${name}`);

    return (msg: Lowercase<string>, fields?: JsonifiableObject) => {
      longestMessage = Math.max(longestMessage, msg.length);
      fields = { ...baseFields(), ...fields };
      if ("error" in fields) {
        fields.error = serializeError(fields.error);
      }

      if (isEmpty(fields)) {
        debug("%s%s", repeat(" ", longestName - name.length), padEnd(msg, longestMessage));
      } else {
        debug("%s%s %o", repeat(" ", longestName - name.length), padEnd(msg, longestMessage), fields);
      }

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
  };
};
