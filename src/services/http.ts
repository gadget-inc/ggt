import got, { HTTPError, type OptionsInit } from "got";
import { breadcrumb } from "./breadcrumbs.js";
import { config } from "./config.js";
import { readSession, writeSession } from "./session.js";

export const http = got.extend({
  hooks: {
    beforeRequest: [
      (options) => {
        options.headers["user-agent"] = config.versionFull;
        breadcrumb({
          type: "debug",
          category: "http",
          message: "HTTP request",
          data: {
            method: options.method,
            url: options.url,
          },
        });
      },
    ],
    afterResponse: [
      (response) => {
        breadcrumb({
          type: "debug",
          category: "http",
          message: "HTTP response",
          data: {
            method: response.method,
            url: response.url,
            statusCode: response.statusCode,
            traceId: response.headers["x-trace-id"],
          },
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
    breadcrumb({
      type: "debug",
      category: "http",
      message: "Swallowing unauthorized error",
      data: { error },
    });
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