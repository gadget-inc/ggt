import { got, type OptionsInit } from "got";
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import { config } from "../config/config.js";
import { createLogger } from "../output/log/logger.js";
import { writeSession } from "../user/session.js";
import { serializeError } from "../util/object.js";
import { isGadgetServicesRequest } from "./auth.js";

export const log = createLogger({ name: "http" });

export type HttpOptions = OptionsInit;

/**
 * An instance of the `got` library with hooks for logging and handling
 * 401 errors. This should be used for all HTTP requests.
 */
export const http = got.extend({
  agent: {
    http: new HttpAgent({ keepAlive: true }),
    https: new HttpsAgent({ keepAlive: true }),
  },
  hooks: {
    beforeRequest: [
      (options) => {
        options.headers["user-agent"] = config.versionFull;
        log.debug("http request", {
          request: {
            method: options.method,
            url: options.url?.toString(),
          },
        });
      },
    ],
    beforeRetry: [
      (error, retryCount) => {
        log.warn("http request failed, retrying...", {
          retryCount,
          error: serializeError(error),
          request: error.request && {
            method: error.request.options.method,
            url: error.request.options.url?.toString(),
          },
        });
      },
    ],
    afterResponse: [
      (response) => {
        log.debug("http response", {
          request: {
            method: response.request.options.method,
            url: response.request.options.url?.toString(),
          },
          response: {
            statusCode: response.statusCode,
            traceId: response.headers["x-trace-id"],
            durationMs: response.timings.phases.total,
          },
        });

        if (response.statusCode === 401 && isGadgetServicesRequest(response.request.options)) {
          // clear the session if the request was unauthorized
          writeSession(undefined);
        }

        return response;
      },
    ],
  },
});
