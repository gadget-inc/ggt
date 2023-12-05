import { got, HTTPError, type OptionsInit } from "got";
import { config } from "../config/config.js";
import { createLogger } from "../output/log/logger.js";
import { readSession, writeSession } from "../user/session.js";

const log = createLogger({ name: "http" });

/**
 * An instance of the `got` library with hooks for logging and handling
 * 401 errors. This should be used for all HTTP requests.
 */
export const http = got.extend({
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
          error: {
            code: error.code,
            name: error.name,
            message: error.message,
          },
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

export const isUnauthorized = (error: unknown): boolean => {
  return error instanceof HTTPError && error.response.statusCode === 401 && isGadgetServicesRequest(error.request.options);
};

/**
 * Swallows unauthorized errors and logs a warning, rethrows all other
 * errors.
 *
 * @param error The error to handle.
 */
export const swallowUnauthorized = (error: unknown): void => {
  if (isUnauthorized(error)) {
    log.warn("swallowing unauthorized error", { error });
    return;
  }
  throw error;
};

/**
 * Loads the cookie from the session.
 *
 * @returns The cookie string or undefined if there is no session.
 */
export const loadCookie = (): string | undefined => {
  const token = readSession();
  return token && `session=${encodeURIComponent(token)};`;
};

/**
 * Determines whether the given request options are for a Gadget
 * Services request.
 *
 * @param options - The request options to check.
 * @returns True if the request options are for a Gadget Services
 * request, false otherwise.
 */
const isGadgetServicesRequest = (options: OptionsInit): boolean => {
  return options.url instanceof URL && options.url.host === config.domains.services;
};
