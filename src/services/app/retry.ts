import type { CloseEvent, ErrorEvent } from "ws";
import { isCloseEvent, isError, isErrorEvent, isGraphQLErrors, isStringArray } from "../util/is.js";
import {
  calculateBackoffDelay,
  DEFAULT_BACKOFF_LIMIT_MS,
  DEFAULT_JITTER_MS,
  DEFAULT_RETRY_LIMIT,
  isRetryableNetworkErrorCode,
  RETRYABLE_NETWORK_ERROR_CODES,
} from "../util/retry.js";
import type { ClientError } from "./error.js";

// Re-export shared retry utilities for backwards compatibility
export {
  calculateBackoffDelay,
  DEFAULT_BACKOFF_LIMIT_MS,
  DEFAULT_JITTER_MS,
  DEFAULT_RETRY_LIMIT,
  isRetryableNetworkErrorCode,
  RETRYABLE_NETWORK_ERROR_CODES,
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

// Backwards compatibility alias
export const isRetryableErrorCode = isRetryableNetworkErrorCode;

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
 * Determines if a ClientError should be retried based on its cause.
 */
export const isRetryableClientError = (error: ClientError): boolean => {
  const cause = error.cause;

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
