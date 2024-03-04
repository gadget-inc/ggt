import { HTTPError, type OptionsInit } from "got";
import type { Context } from "../command/context.js";
import { config } from "../config/config.js";
import { createLogger } from "../output/log/logger.js";
import { readSession, readToken } from "../user/session.js";

const log = createLogger({ name: "auth" });

/**
 * Determines whether the given request options are for a Gadget
 * Services request.
 *
 * @param options - The request options to check.
 * @returns True if the request options are for a Gadget Services
 * request, false otherwise.
 */
export const isGadgetServicesRequest = (options: OptionsInit): boolean => {
  return options.url instanceof URL && options.url.host === config.domains.services;
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
 * Loads the authentication headers.
 *
 * @returns The authentication headers as a record of key-value pairs, or undefined if no headers are available.
 */
export const loadAuthHeaders = (): Record<string, string> | undefined => {
  const cookie = loadCookie();
  if (cookie) {
    log.trace("loading cookie as auth header", { cookie });
    return { cookie };
  }

  const token = readToken();

  if (token) {
    log.trace("loading token as auth header", { token });
    return { "x-platform-access-token": token };
  }

  return undefined;
};

export const isUnauthorizedError = (error: unknown): error is HTTPError => {
  return error instanceof HTTPError && error.response.statusCode === 401;
};

/**
 * Swallows unauthorized errors and logs a warning, rethrows all other
 * errors.
 *
 * @param ctx - The current context.
 * @param error - The error to handle.
 */
export const swallowUnauthorized = (ctx: Context, error: unknown): void => {
  if (isUnauthorizedError(error)) {
    ctx.log.warn("swallowing unauthorized error", { error });
    return;
  }
  throw error;
};
