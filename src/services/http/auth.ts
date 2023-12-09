import { HTTPError, type OptionsInit } from "got";
import { config } from "../config/config.js";
import { readSession } from "../user/session.js";
import { log } from "./http.js";

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

export const isUnauthorizedError = (error: unknown): error is HTTPError => {
  return error instanceof HTTPError && error.response.statusCode === 401;
};

/**
 * Swallows unauthorized errors and logs a warning, rethrows all other
 * errors.
 *
 * @param error The error to handle.
 */

export const swallowUnauthorized = (error: unknown): void => {
  if (isUnauthorizedError(error)) {
    log.warn("swallowing unauthorized error", { error });
    return;
  }
  throw error;
};
