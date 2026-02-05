import { GraphQLError } from "graphql";
import { describe, expect, it } from "vitest";
import type { CloseEvent, ErrorEvent } from "ws";
import type { GraphQLQuery } from "../../../src/services/app/edit/operation.js";
import { ClientError } from "../../../src/services/app/error.js";
import {
  isRetryableClientError,
  isRetryableCloseEvent,
  isRetryableErrorCode,
  isRetryableErrorEvent,
  isRetryableGraphQLErrors,
  NON_RETRYABLE_CLOSE_CODES,
} from "../../../src/services/app/retry.js";
import { RETRYABLE_NETWORK_ERROR_CODES } from "../../../src/services/util/retry.js";

// Note: calculateBackoffDelay tests are in spec/services/util/retry.spec.ts
// since that's where the function is defined

describe("isRetryableErrorCode", () => {
  it.each(RETRYABLE_NETWORK_ERROR_CODES)("returns true for retryable error code: %s", (code) => {
    const error = { code };
    expect(isRetryableErrorCode(error)).toBe(true);
  });

  it("returns true for EADDRINUSE (bug fix verification)", () => {
    // EADDRINUSE was previously missing from the WebSocket client's retryable codes
    const error = { code: "EADDRINUSE" };
    expect(isRetryableErrorCode(error)).toBe(true);
  });

  it("returns false for non-retryable error codes", () => {
    expect(isRetryableErrorCode({ code: "ENOENT" })).toBe(false);
    expect(isRetryableErrorCode({ code: "EACCES" })).toBe(false);
    expect(isRetryableErrorCode({ code: "UNKNOWN" })).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isRetryableErrorCode(null)).toBe(false);
    expect(isRetryableErrorCode(undefined)).toBe(false);
    expect(isRetryableErrorCode("ECONNRESET")).toBe(false);
    expect(isRetryableErrorCode(123)).toBe(false);
  });

  it("returns false for objects without code property", () => {
    expect(isRetryableErrorCode({})).toBe(false);
    expect(isRetryableErrorCode({ message: "error" })).toBe(false);
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

describe("isRetryableClientError", () => {
  const mockQuery = "query { foo }" as GraphQLQuery;

  it("returns true for retryable CloseEvent", () => {
    const error = new ClientError(mockQuery, {
      type: "close",
      code: 1006,
      reason: "Abnormal closure",
      wasClean: false,
    } as CloseEvent);
    expect(isRetryableClientError(error)).toBe(true);
  });

  it("returns false for normal closure CloseEvent", () => {
    const error = new ClientError(mockQuery, {
      type: "close",
      code: 1000,
      reason: "Normal closure",
      wasClean: true,
    } as CloseEvent);
    expect(isRetryableClientError(error)).toBe(false);
  });

  it("returns true for retryable ErrorEvent", () => {
    const networkError = Object.assign(new Error("connect ECONNRESET"), { code: "ECONNRESET" });
    const error = new ClientError(mockQuery, {
      type: "error",
      message: "connect ECONNRESET",
      error: networkError,
    } as ErrorEvent);
    expect(isRetryableClientError(error)).toBe(true);
  });

  it("returns true for retryable Error with code", () => {
    const networkError = Object.assign(new Error("Connection refused"), { code: "ECONNREFUSED" });
    const error = new ClientError(mockQuery, networkError);
    expect(isRetryableClientError(error)).toBe(true);
  });

  it("returns false for Error without retryable code", () => {
    const error = new ClientError(mockQuery, new Error("Some error"));
    expect(isRetryableClientError(error)).toBe(false);
  });

  it("returns true for retryable GraphQL errors", () => {
    const error = new ClientError(mockQuery, [new GraphQLError("Internal server error")]);
    expect(isRetryableClientError(error)).toBe(true);
  });

  it("returns false for auth-related GraphQL errors", () => {
    const error = new ClientError(mockQuery, [new GraphQLError("Unauthenticated")]);
    expect(isRetryableClientError(error)).toBe(false);
  });

  it("returns true for generic string errors", () => {
    const error = new ClientError(mockQuery, "Connection timed out");
    expect(isRetryableClientError(error)).toBe(true);
  });

  it("returns false for auth-related string errors", () => {
    const error = new ClientError(mockQuery, "Unauthenticated. No authenticated client.");
    expect(isRetryableClientError(error)).toBe(false);
  });

  it("returns true for generic string array errors", () => {
    const error = new ClientError(mockQuery, ["Internal server error"]);
    expect(isRetryableClientError(error)).toBe(true);
  });

  it("returns false for auth-related string array errors", () => {
    const error = new ClientError(mockQuery, ["Unauthenticated"]);
    expect(isRetryableClientError(error)).toBe(false);
  });

  it("returns false if any string in array matches auth pattern", () => {
    const error = new ClientError(mockQuery, ["Internal server error", "Permission denied"]);
    expect(isRetryableClientError(error)).toBe(false);
  });
});
