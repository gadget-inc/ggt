import type { GraphQLError } from "graphql";
import type { CloseEvent, ErrorEvent } from "ws";

import ms from "ms";

import { isCloseEvent, isError, isErrorEvent, isGraphQLErrors, isObject, isStringArray } from "./is.js";

/**
 * Network error codes that indicate transient failures worth retrying.
 * Used by both HTTP and WebSocket clients.
 */
export const RETRYABLE_NETWORK_ERROR_CODES = [
  "ETIMEDOUT",
  "ECONNRESET",
  "EADDRINUSE",
  "ECONNREFUSED",
  "EPIPE",
  "ENOTFOUND",
  "ENETUNREACH",
  "EAI_AGAIN",
  "EADDRNOTAVAIL",
  "EHOSTUNREACH",
  "ERR_SSL_SSL/TLS_ALERT_BAD_RECORD_MAC",
  "EPROTO", // General SSL/TLS protocol errors
] as const;

export const DEFAULT_BACKOFF_LIMIT_MS = ms("5s");
export const DEFAULT_JITTER_MS = 100;
export const DEFAULT_RETRY_LIMIT = 10;

export const DEFAULT_RETRYABLE_HTTP_METHODS = ["GET", "PUT", "HEAD", "DELETE", "OPTIONS", "TRACE"] as const;
export const DEFAULT_RETRYABLE_HTTP_STATUS_CODES = [408, 413, 429, 500, 502, 503, 504, 521, 522, 524] as const;

/**
 * Calculate exponential backoff delay with jitter.
 *
 * @param attempt - The current retry attempt (1-indexed)
 * @param backoffLimit - Maximum delay in milliseconds
 * @param jitter - Random jitter range (+/- jitter ms)
 * @returns Delay in milliseconds
 */
export const calculateBackoffDelay = (attempt: number, backoffLimit = DEFAULT_BACKOFF_LIMIT_MS, jitter = DEFAULT_JITTER_MS): number => {
  const baseDelay = Math.min(Math.pow(2, attempt) * 100, backoffLimit);
  return Math.max(0, baseDelay + (Math.random() * jitter * 2 - jitter));
};

/**
 * Check if an error has a retryable network error code.
 */
export const isRetryableNetworkErrorCode = (error: unknown): boolean => {
  if (!isObject(error) || !("code" in error)) {
    return false;
  }
  return RETRYABLE_NETWORK_ERROR_CODES.includes(error.code as (typeof RETRYABLE_NETWORK_ERROR_CODES)[number]);
};

/**
 * Patterns for non-retryable authentication/authorization errors.
 * These indicate permanent failures that won't be resolved by retrying.
 */
const NON_RETRYABLE_AUTH_PATTERNS = [/unauthenticated/i, /unauthorized/i, /forbidden/i, /not allowed/i, /permission denied/i] as const;

/**
 * WebSocket close codes that should NOT be retried.
 * - 1000: Normal closure
 * - 1008: Policy violation
 * - 4401: Unauthorized
 * - 4403: Forbidden
 */
export const NON_RETRYABLE_CLOSE_CODES = [1000, 1008, 4401, 4403] as const;

/**
 * Check if an ErrorEvent contains a retryable error.
 */
export const isRetryableErrorEvent = (event: ErrorEvent): boolean => {
  return isRetryableNetworkErrorCode(event.error);
};

/**
 * Check if a WebSocket close event is retryable.
 * Returns true unless the close code indicates a permanent failure.
 */
export const isRetryableCloseEvent = (event: CloseEvent): boolean => {
  return !NON_RETRYABLE_CLOSE_CODES.includes(event.code as (typeof NON_RETRYABLE_CLOSE_CODES)[number]);
};

/**
 * Check if GraphQL errors are transient and worth retrying.
 * Authentication and authorization errors are not retryable.
 */
export const isRetryableGraphQLErrors = (errors: readonly { message: string; extensions?: Record<string, unknown> }[]): boolean => {
  return !errors.some((error) => {
    // Check for auth-related error codes in extensions
    const code = error.extensions?.["code"];
    if (code === "UNAUTHENTICATED" || code === "FORBIDDEN" || code === "UNAUTHORIZED") {
      return true;
    }

    // Check message patterns
    return NON_RETRYABLE_AUTH_PATTERNS.some((pattern) => pattern.test(error.message));
  });
};

export type RetryOptions = {
  /**
   * Maximum number of retry attempts.
   * @default 10
   */
  maxAttempts?: number;

  /**
   * Callback invoked before each retry attempt.
   */
  onRetry?: (attempt: number, error: unknown) => void;
};

/**
 * Determines if an error cause should be retried based on its type.
 */
export const isRetryableErrorCause = (cause: string | string[] | Error | readonly GraphQLError[] | CloseEvent | ErrorEvent): boolean => {
  if (isCloseEvent(cause)) {
    return isRetryableCloseEvent(cause);
  }

  if (isErrorEvent(cause)) {
    return isRetryableErrorEvent(cause);
  }

  if (isError(cause)) {
    return isRetryableNetworkErrorCode(cause);
  }

  if (isGraphQLErrors(cause)) {
    return isRetryableGraphQLErrors(cause);
  }

  // String errors are generally server-side errors that may be transient
  if (typeof cause === "string") {
    return !NON_RETRYABLE_AUTH_PATTERNS.some((pattern) => pattern.test(cause));
  }

  // String array errors - apply same logic as single strings
  if (isStringArray(cause)) {
    return !cause.some((str) => NON_RETRYABLE_AUTH_PATTERNS.some((pattern) => pattern.test(str)));
  }

  // Unknown error types - don't retry
  return false;
};
