import { got, HTTPError, type OptionsInit } from "got";
import { config } from "./config.js";
import { createLogger } from "./log.js";
import { readSession, writeSession } from "./session.js";

const log = createLogger("http");

/**
 * An instance of the `got` library with hooks for logging and handling
 * 401 errors. This should be used for all HTTP requests.
 */
export const http = got.extend({
  hooks: {
    beforeRequest: [
      (options) => {
        options.headers["user-agent"] = config.versionFull;
        log.info("http request", {
          method: options.method,
          url: options.url?.toString(),
        });
      },
    ],
    afterResponse: [
      (response) => {
        log.info("http response", {
          method: response.request.options.method,
          url: response.request.options.url?.toString(),
          statusCode: response.statusCode,
          traceId: response.headers["x-trace-id"],
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
