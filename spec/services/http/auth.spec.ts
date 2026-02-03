import { HTTPError } from "got";
import { describe, expect, it, vi } from "vitest";
import { config } from "../../../src/services/config/config.js";
import {
  isGadgetServicesRequest,
  isUnauthorizedError,
  loadAuthHeaders,
  loadCookie,
  maybeLoadAuthHeaders,
  swallowUnauthorized,
} from "../../../src/services/http/auth.js";
import { writeSession } from "../../../src/services/user/session.js";
import { mockContext, testCtx } from "../../__support__/context.js";

/**
 * Creates a mock HTTPError for testing without requiring all the
 * internal properties that got's HTTPError constructor expects.
 */
const createMockHTTPError = (statusCode: number): HTTPError => {
  const error = Object.create(HTTPError.prototype) as HTTPError;
  const mockOptions = {
    method: "GET",
    url: new URL("https://example.com"),
  };
  const mockRequest = {
    options: mockOptions,
  };
  Object.defineProperty(error, "response", {
    value: { statusCode, request: mockRequest },
    enumerable: true,
  });
  Object.defineProperty(error, "request", {
    value: mockRequest,
    enumerable: true,
  });
  // serializeError accesses error.options.method for RequestError instances
  Object.defineProperty(error, "options", {
    value: mockOptions,
    enumerable: true,
  });
  Object.defineProperty(error, "message", {
    value: `Request failed with status code ${statusCode}`,
    enumerable: true,
  });
  return error;
};

describe("auth", () => {
  mockContext();

  describe("isGadgetServicesRequest", () => {
    it("returns true for Gadget services URL", () => {
      const url = new URL(`https://${config.domains.services}/api/graphql`);
      expect(isGadgetServicesRequest({ url })).toBe(true);
    });

    it("returns false for non-Gadget services URL", () => {
      const url = new URL("https://example.com/api");
      expect(isGadgetServicesRequest({ url })).toBe(false);
    });

    it("returns false when url is not a URL instance", () => {
      expect(isGadgetServicesRequest({ url: "https://app.gadget.dev" })).toBe(false);
      expect(isGadgetServicesRequest({})).toBe(false);
    });
  });

  describe("loadCookie", () => {
    it("returns encoded session cookie when session exists", () => {
      writeSession(testCtx, "test-session-token");

      const cookie = loadCookie(testCtx);

      expect(cookie).toBe("session=test-session-token;");
    });

    it("encodes special characters in session", () => {
      writeSession(testCtx, "token with spaces & special=chars");

      const cookie = loadCookie(testCtx);

      expect(cookie).toBe(`session=${encodeURIComponent("token with spaces & special=chars")};`);
    });

    it("returns undefined when no session exists", () => {
      // Don't write a session - context starts fresh

      const cookie = loadCookie(testCtx);

      expect(cookie).toBeUndefined();
    });
  });

  describe("loadAuthHeaders", () => {
    it("throws when no auth is available", () => {
      // No session or token set

      expect(() => loadAuthHeaders(testCtx)).toThrow("missing auth headers");
    });

    it("returns headers when session exists", () => {
      writeSession(testCtx, "session-token");

      const headers = loadAuthHeaders(testCtx);

      expect(headers).toEqual({ cookie: "session=session-token;" });
    });
  });

  describe("maybeLoadAuthHeaders", () => {
    it("returns cookie header when session exists", () => {
      writeSession(testCtx, "session-token");

      const headers = maybeLoadAuthHeaders(testCtx);

      expect(headers).toEqual({ cookie: "session=session-token;" });
    });

    it("returns token header when token exists but no session", () => {
      vi.stubEnv("GGT_TOKEN", "api-token");

      const headers = maybeLoadAuthHeaders(testCtx);

      expect(headers).toEqual({ "x-platform-access-token": "api-token" });
    });

    it("prefers cookie over token when both exist", () => {
      writeSession(testCtx, "session-token");
      vi.stubEnv("GGT_TOKEN", "api-token");

      const headers = maybeLoadAuthHeaders(testCtx);

      expect(headers).toEqual({ cookie: "session=session-token;" });
    });

    it("returns undefined when neither session nor token exists", () => {
      // No session or token set

      const headers = maybeLoadAuthHeaders(testCtx);

      expect(headers).toBeUndefined();
    });
  });

  describe("isUnauthorizedError", () => {
    it("returns true for HTTPError with 401 status", () => {
      const error = createMockHTTPError(401);

      expect(isUnauthorizedError(error)).toBe(true);
    });

    it("returns false for HTTPError with non-401 status", () => {
      const error = createMockHTTPError(403);

      expect(isUnauthorizedError(error)).toBe(false);
    });

    it("returns false for non-HTTPError", () => {
      expect(isUnauthorizedError(new Error("regular error"))).toBe(false);
      expect(isUnauthorizedError(null)).toBe(false);
      expect(isUnauthorizedError({ statusCode: 401 })).toBe(false);
    });
  });

  describe("swallowUnauthorized", () => {
    it("does not throw for 401 errors", () => {
      const error = createMockHTTPError(401);

      expect(() => swallowUnauthorized(testCtx, error)).not.toThrow();
    });

    it("rethrows non-401 HTTPErrors", () => {
      const error = createMockHTTPError(500);

      expect(() => swallowUnauthorized(testCtx, error)).toThrow(error);
    });

    it("rethrows non-HTTPError errors", () => {
      const error = new Error("some other error");

      expect(() => swallowUnauthorized(testCtx, error)).toThrow(error);
    });
  });
});
