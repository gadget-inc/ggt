import { GraphQLError } from "graphql";
import { describe, expect, it, vi } from "vitest";
import type { CloseEvent, ErrorEvent } from "ws";
import {
  calculateBackoffDelay,
  DEFAULT_BACKOFF_LIMIT_MS,
  DEFAULT_JITTER_MS,
  isRetryableCloseEvent,
  isRetryableErrorCause,
  isRetryableErrorEvent,
  isRetryableGraphQLErrors,
  isRetryableNetworkErrorCode,
  NON_RETRYABLE_CLOSE_CODES,
  RETRYABLE_NETWORK_ERROR_CODES,
} from "../../../src/services/util/retry.js";

describe("RETRYABLE_NETWORK_ERROR_CODES", () => {
  it("includes EADDRINUSE", () => {
    // This was previously missing from the WebSocket client's list
    expect(RETRYABLE_NETWORK_ERROR_CODES).toContain("EADDRINUSE");
  });

  it("includes all expected network error codes", () => {
    const expectedCodes = [
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
      "EPROTO",
    ];

    for (const code of expectedCodes) {
      expect(RETRYABLE_NETWORK_ERROR_CODES).toContain(code);
    }
    expect(RETRYABLE_NETWORK_ERROR_CODES).toHaveLength(expectedCodes.length);
  });
});

describe("calculateBackoffDelay", () => {
  it("returns exponentially increasing delays", () => {
    // Mock Math.random to return 0.5 for predictable results (no jitter effect)
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    // With jitter = 0.5, the jitter term is: 0.5 * jitter * 2 - jitter = 0
    expect(calculateBackoffDelay(1)).toBe(200); // 2^1 * 100 = 200
    expect(calculateBackoffDelay(2)).toBe(400); // 2^2 * 100 = 400
    expect(calculateBackoffDelay(3)).toBe(800); // 2^3 * 100 = 800
    expect(calculateBackoffDelay(4)).toBe(1600); // 2^4 * 100 = 1600
    expect(calculateBackoffDelay(5)).toBe(3200); // 2^5 * 100 = 3200

    vi.restoreAllMocks();
  });

  it("caps delay at backoffLimit", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    // 2^10 * 100 = 102400, but should be capped at 5000
    expect(calculateBackoffDelay(10)).toBe(DEFAULT_BACKOFF_LIMIT_MS);
    expect(calculateBackoffDelay(15)).toBe(DEFAULT_BACKOFF_LIMIT_MS);

    vi.restoreAllMocks();
  });

  it("adds jitter within expected range", () => {
    const results: number[] = [];
    for (let i = 0; i < 100; i++) {
      results.push(calculateBackoffDelay(1));
    }

    // Base delay for attempt 1 is 200ms
    // Jitter range is +/- 100ms (DEFAULT_JITTER_MS)
    // So valid range is 100-300ms
    const minExpected = 200 - DEFAULT_JITTER_MS;
    const maxExpected = 200 + DEFAULT_JITTER_MS;

    expect(Math.min(...results)).toBeGreaterThanOrEqual(minExpected);
    expect(Math.max(...results)).toBeLessThanOrEqual(maxExpected);
  });

  it("accepts custom backoffLimit and jitter", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    expect(calculateBackoffDelay(10, 1000, 0)).toBe(1000);
    expect(calculateBackoffDelay(1, 5000, 50)).toBe(200); // 200 + 0 jitter

    vi.restoreAllMocks();
  });

  it("never returns negative values", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // Maximum negative jitter

    // Even with max negative jitter, should be >= 0
    expect(calculateBackoffDelay(1, 5000, 500)).toBeGreaterThanOrEqual(0);

    vi.restoreAllMocks();
  });
});

describe("isRetryableNetworkErrorCode", () => {
  it.each(RETRYABLE_NETWORK_ERROR_CODES)("returns true for retryable error code: %s", (code) => {
    const error = { code };
    expect(isRetryableNetworkErrorCode(error)).toBe(true);
  });

  it("returns true for EADDRINUSE (bug fix verification)", () => {
    // Explicitly test EADDRINUSE since it was previously missing from WebSocket retry logic
    const error = { code: "EADDRINUSE" };
    expect(isRetryableNetworkErrorCode(error)).toBe(true);
  });

  it("returns false for non-retryable error codes", () => {
    expect(isRetryableNetworkErrorCode({ code: "ENOENT" })).toBe(false);
    expect(isRetryableNetworkErrorCode({ code: "EACCES" })).toBe(false);
    expect(isRetryableNetworkErrorCode({ code: "UNKNOWN" })).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isRetryableNetworkErrorCode(null)).toBe(false);
    expect(isRetryableNetworkErrorCode(undefined)).toBe(false);
    expect(isRetryableNetworkErrorCode("ECONNRESET")).toBe(false);
    expect(isRetryableNetworkErrorCode(123)).toBe(false);
  });

  it("returns false for objects without code property", () => {
    expect(isRetryableNetworkErrorCode({})).toBe(false);
    expect(isRetryableNetworkErrorCode({ message: "error" })).toBe(false);
  });
});

describe("isRetryableErrorEvent", () => {
  it("returns true when ErrorEvent contains retryable error", () => {
    const event = {
      type: "error",
      message: "connect ECONNREFUSED",
      error: { code: "ECONNREFUSED" },
    } as ErrorEvent;
    expect(isRetryableErrorEvent(event)).toBe(true);
  });

  it("returns false when ErrorEvent contains non-retryable error", () => {
    const event = {
      type: "error",
      message: "file not found",
      error: { code: "ENOENT" },
    } as ErrorEvent;
    expect(isRetryableErrorEvent(event)).toBe(false);
  });

  it("returns false when ErrorEvent error has no code", () => {
    const event = {
      type: "error",
      message: "unknown error",
      error: new Error("unknown"),
    } as ErrorEvent;
    expect(isRetryableErrorEvent(event)).toBe(false);
  });
});

describe("isRetryableCloseEvent", () => {
  it.each(NON_RETRYABLE_CLOSE_CODES)("returns false for non-retryable close code: %d", (code) => {
    const event = { type: "close", code, reason: "", wasClean: true } as CloseEvent;
    expect(isRetryableCloseEvent(event)).toBe(false);
  });

  it("returns true for retryable close codes", () => {
    const retryableCodes = [1001, 1006, 1011, 1012, 1013, 1014];
    for (const code of retryableCodes) {
      const event = { type: "close", code, reason: "", wasClean: false } as CloseEvent;
      expect(isRetryableCloseEvent(event)).toBe(true);
    }
  });
});

describe("isRetryableGraphQLErrors", () => {
  it("returns true for transient server errors", () => {
    expect(isRetryableGraphQLErrors([{ message: "Internal server error" }])).toBe(true);
    expect(isRetryableGraphQLErrors([{ message: "Service unavailable" }])).toBe(true);
    expect(isRetryableGraphQLErrors([{ message: "Gateway timeout" }])).toBe(true);
  });

  it("returns false for authentication errors", () => {
    expect(isRetryableGraphQLErrors([{ message: "Unauthenticated" }])).toBe(false);
    expect(isRetryableGraphQLErrors([{ message: "User is unauthenticated" }])).toBe(false);
    expect(isRetryableGraphQLErrors([{ message: "Request unauthorized" }])).toBe(false);
  });

  it("returns false for authorization errors", () => {
    expect(isRetryableGraphQLErrors([{ message: "Forbidden" }])).toBe(false);
    expect(isRetryableGraphQLErrors([{ message: "Access not allowed" }])).toBe(false);
    expect(isRetryableGraphQLErrors([{ message: "Permission denied" }])).toBe(false);
  });

  it("returns false for errors with auth-related extension codes", () => {
    expect(isRetryableGraphQLErrors([{ message: "Error", extensions: { code: "UNAUTHENTICATED" } }])).toBe(false);
    expect(isRetryableGraphQLErrors([{ message: "Error", extensions: { code: "FORBIDDEN" } }])).toBe(false);
    expect(isRetryableGraphQLErrors([{ message: "Error", extensions: { code: "UNAUTHORIZED" } }])).toBe(false);
  });

  it("returns true when extensions has non-auth code", () => {
    expect(isRetryableGraphQLErrors([{ message: "Error", extensions: { code: "INTERNAL_ERROR" } }])).toBe(true);
  });

  it("returns false if any error is non-retryable", () => {
    expect(isRetryableGraphQLErrors([{ message: "Internal server error" }, { message: "Unauthenticated" }])).toBe(false);
  });
});

describe("isRetryableErrorCause", () => {
  it("returns true for retryable CloseEvent", () => {
    const cause = {
      type: "close",
      code: 1006,
      reason: "Abnormal closure",
      wasClean: false,
    } as CloseEvent;
    expect(isRetryableErrorCause(cause)).toBe(true);
  });

  it("returns false for normal closure CloseEvent", () => {
    const cause = {
      type: "close",
      code: 1000,
      reason: "Normal closure",
      wasClean: true,
    } as CloseEvent;
    expect(isRetryableErrorCause(cause)).toBe(false);
  });

  it("returns true for retryable ErrorEvent", () => {
    const networkError = Object.assign(new Error("connect ECONNRESET"), { code: "ECONNRESET" });
    const cause = {
      type: "error",
      message: "connect ECONNRESET",
      error: networkError,
    } as ErrorEvent;
    expect(isRetryableErrorCause(cause)).toBe(true);
  });

  it("returns true for retryable Error with code", () => {
    const cause = Object.assign(new Error("Connection refused"), { code: "ECONNREFUSED" });
    expect(isRetryableErrorCause(cause)).toBe(true);
  });

  it("returns false for Error without retryable code", () => {
    expect(isRetryableErrorCause(new Error("Some error"))).toBe(false);
  });

  it("returns true for retryable GraphQL errors", () => {
    expect(isRetryableErrorCause([new GraphQLError("Internal server error")])).toBe(true);
  });

  it("returns false for auth-related GraphQL errors", () => {
    expect(isRetryableErrorCause([new GraphQLError("Unauthenticated")])).toBe(false);
  });

  it("returns true for generic string errors", () => {
    expect(isRetryableErrorCause("Connection timed out")).toBe(true);
  });

  it("returns false for auth-related string errors", () => {
    expect(isRetryableErrorCause("Unauthenticated. No authenticated client.")).toBe(false);
  });

  it("returns true for generic string array errors", () => {
    expect(isRetryableErrorCause(["Internal server error"])).toBe(true);
  });

  it("returns false for auth-related string array errors", () => {
    expect(isRetryableErrorCause(["Unauthenticated"])).toBe(false);
  });

  it("returns false if any string in array matches auth pattern", () => {
    expect(isRetryableErrorCause(["Internal server error", "Permission denied"])).toBe(false);
  });
});
