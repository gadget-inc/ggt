import { got, HTTPError, type OptionsInit } from "got";
import { config } from "./config.js";
import { createLogger } from "./log.js";
import { readSession, writeSession } from "./session.js";

const log = createLogger("http");

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

        if (response.statusCode === 401 && isGadgetRequest(response.request.options)) {
          writeSession(undefined);
        }
        return response;
      },
    ],
  },
});

export const isUnauthorized = (error: unknown): boolean => {
  return error instanceof HTTPError && error.response.statusCode === 401 && isGadgetRequest(error.request.options);
};

export const swallowUnauthorized = (error: unknown): void => {
  if (isUnauthorized(error)) {
    log.warn("swallowing unauthorized error", { error });
    return;
  }
  throw error;
};

export const loadCookie = (): string | undefined => {
  const token = readSession();
  return token && `session=${encodeURIComponent(token)};`;
};

const isGadgetRequest = (options: OptionsInit) => {
  return options.url instanceof URL && options.url.host === config.domains.services;
};
