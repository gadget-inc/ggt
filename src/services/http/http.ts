import { got, type OptionsInit } from "got";
import assert from "node:assert";
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import { parseString as parseSetCookieString } from "set-cookie-parser";

import { Context } from "../command/context.js";
import { config } from "../config/config.js";
import { sprint } from "../output/sprint.js";
import { writeSession } from "../user/session.js";
import { serializeError } from "../util/object.js";
import {
  DEFAULT_BACKOFF_LIMIT_MS,
  DEFAULT_JITTER_MS,
  DEFAULT_RETRYABLE_HTTP_METHODS,
  DEFAULT_RETRYABLE_HTTP_STATUS_CODES,
  DEFAULT_RETRY_LIMIT,
  RETRYABLE_NETWORK_ERROR_CODES,
} from "../util/retry.js";

export type HttpOptions = OptionsInit;

const getContext = (options: HttpOptions): Context => {
  assert(
    options.context?.["ctx"] instanceof Context,
    sprint(`
      ctx must be provided to http requests:

      const response = await http({
        context: { ctx },
        ...options,
      });
    `),
  );

  return options.context["ctx"];
};

/**
 * An instance of the `got` library with hooks for logging and handling
 * 401 errors. This should be used for all HTTP requests.
 */
export const http = got.extend({
  agent: {
    http: new HttpAgent({ keepAlive: true }),
    https: new HttpsAgent({
      keepAlive: true,
      minVersion: "TLSv1.1",
    }),
  },
  retry: {
    limit: DEFAULT_RETRY_LIMIT,
    methods: [...DEFAULT_RETRYABLE_HTTP_METHODS],
    statusCodes: [...DEFAULT_RETRYABLE_HTTP_STATUS_CODES],
    errorCodes: [...RETRYABLE_NETWORK_ERROR_CODES],
    maxRetryAfter: undefined,
    calculateDelay: ({ computedValue }) => computedValue,
    backoffLimit: DEFAULT_BACKOFF_LIMIT_MS,
    noise: DEFAULT_JITTER_MS,
  },
  hooks: {
    beforeRequest: [
      (options) => {
        const ctx = getContext(options);
        options.signal = ctx.signal;
        options.headers["user-agent"] = config.versionFull;
        ctx.log.debug("http request", {
          http: {
            request: {
              method: options.method,
              url: options.url?.toString(),
            },
          },
        });
      },
    ],
    beforeRetry: [
      (error, retryCount) => {
        const ctx = getContext(error.request?.options ?? error.options.context);

        ctx.log.warn("http request failed, retrying...", {
          http: {
            retryCount,
            error: serializeError(error),
            request: error.request && {
              method: error.request.options.method,
              url: error.request.options.url?.toString(),
            },
            response: error.response && {
              statusCode: error.response.statusCode,
              traceId: error.response.headers["x-trace-id"],
              durationMs: error.response.timings.phases.total,
            },
          },
        });
      },
    ],
    afterResponse: [
      (response) => {
        const ctx = getContext(response.request.options);
        ctx.log.debug("http response", {
          http: {
            request: {
              method: response.request.options.method,
              url: response.request.options.url?.toString(),
            },
            response: {
              statusCode: response.statusCode,
              traceId: response.headers["x-trace-id"],
              durationMs: response.timings.phases.total,
            },
          },
        });

        if (response.statusCode === 401) {
          // clear the session if the request was unauthorized
          writeSession(ctx, undefined);
        }

        if (response.headers["set-cookie"]) {
          const setCookieHeader = response.headers["set-cookie"];
          const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
          cookies.forEach((cookieString) => {
            const cookie = parseSetCookieString(cookieString);
            if (cookie.name === "session" && (cookie.domain === "gadget.dev" || cookie.domain === "ggt.dev")) {
              writeSession(ctx, cookie.value);
            }
          });
        }

        return response;
      },
    ],
  },
});
