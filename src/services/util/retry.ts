import ms from "ms";
import { isObject } from "./is.js";

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
