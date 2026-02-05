import { describe, expect, it, vi } from "vitest";
import {
  calculateBackoffDelay,
  DEFAULT_BACKOFF_LIMIT_MS,
  DEFAULT_JITTER_MS,
  isRetryableNetworkErrorCode,
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
