import { describe, expect, it } from "vitest";

import { FILE_SYNC_HASHES_QUERY, REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION } from "../../../src/services/app/edit/operation.js";
import { AuthenticationError, ClientError } from "../../../src/services/app/error.js";
import { IsBug } from "../../../src/services/output/report.js";

describe("ClientError", () => {
  describe("constructor", () => {
    it("accepts string cause", () => {
      const error = new ClientError(undefined, "Something went wrong");

      expect(error.cause).toBe("Something went wrong");
      expect(error.isBug).toBe(IsBug.MAYBE);
    });

    it("accepts string array cause", () => {
      const error = new ClientError(undefined, ["Error 1", "Error 2"]);

      expect(error.cause).toEqual(["Error 1", "Error 2"]);
    });

    it("accepts Error cause", () => {
      const originalError = new Error("Original error");
      const error = new ClientError(undefined, originalError);

      expect(error.cause).toBe(originalError);
    });

    it("accepts GraphQL errors cause", () => {
      const graphqlErrors = [{ message: "Field not found", extensions: {} }];
      const error = new ClientError(undefined, graphqlErrors);

      expect(error.cause).toEqual(graphqlErrors);
    });

    it("serializes ErrorEvent cause", () => {
      const errorEvent = {
        type: "error",
        message: "Connection failed",
        error: new Error("Network error"),
      };
      const error = new ClientError(undefined, errorEvent);

      expect(error.cause).toEqual({
        type: "error",
        message: "Connection failed",
        error: expect.objectContaining({
          message: "Network error",
        }),
      });
    });

    it("serializes CloseEvent cause", () => {
      const closeEvent = {
        type: "close",
        code: 1006,
        reason: "Abnormal closure",
        wasClean: false,
      };
      const error = new ClientError(undefined, closeEvent);

      expect(error.cause).toEqual({
        type: "close",
        code: 1006,
        reason: "Abnormal closure",
        wasClean: false,
      });
    });

    it("accepts custom isBug value", () => {
      const error = new ClientError(undefined, "Error", IsBug.NO);

      expect(error.isBug).toBe(IsBug.NO);
    });

    it("defaults to MAYBE for isBug", () => {
      const error = new ClientError(undefined, "Error");

      expect(error.isBug).toBe(IsBug.MAYBE);
    });
  });

  describe("render", () => {
    it("formats single GraphQL error", () => {
      const error = new ClientError(undefined, [{ message: "Field 'user' not found", extensions: {} }]);

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget

        Gadget responded with the following error:

          • Field 'user' not found"
      `);
    });

    it("formats GraphQL error with operation name", () => {
      const error = new ClientError(FILE_SYNC_HASHES_QUERY, [
        { message: "GGT_INTERNAL_ERROR: error querying clickhouse: Timeout exceeded", extensions: {} },
      ]);

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget (running "FileSyncHashes")

        Gadget responded with the following error:

          • GGT_INTERNAL_ERROR: error querying clickhouse: Timeout exceeded"
      `);
    });

    it("formats multiple GraphQL errors", () => {
      const error = new ClientError(undefined, [
        { message: "Error 1", extensions: {} },
        { message: "Error 2", extensions: {} },
      ]);

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget

        Gadget responded with the following errors:

          • Error 1
          • Error 2"
      `);
    });

    it("deduplicates GraphQL errors with same message", () => {
      const error = new ClientError(undefined, [
        { message: "Duplicate error", extensions: {} },
        { message: "Duplicate error", extensions: {} },
        { message: "Other error", extensions: {} },
      ]);

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget

        Gadget responded with the following errors:

          • Duplicate error
          • Other error"
      `);
    });

    it("renders CloseEvent message", () => {
      const error = new ClientError(undefined, {
        type: "close",
        code: 1006,
        reason: "Connection lost",
        wasClean: false,
      });

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget

        The connection to Gadget closed unexpectedly."
      `);
    });

    it("renders ErrorEvent message", () => {
      const error = new ClientError(undefined, {
        type: "error",
        message: "WebSocket connection failed",
        error: undefined,
      });

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget

        WebSocket connection failed"
      `);
    });

    it("renders Error message", () => {
      const error = new ClientError(undefined, new Error("Something broke"));

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget

        Something broke"
      `);
    });

    it("renders single string array element", () => {
      const error = new ClientError(undefined, ["Only one error"]);

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget

        Only one error"
      `);
    });

    it("renders multiple string array elements joined by comma", () => {
      const error = new ClientError(undefined, ["Error A", "Error B", "Error C"]);

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget

        Error A, Error B, Error C"
      `);
    });

    it("renders string cause directly", () => {
      const error = new ClientError(undefined, "Direct error message");

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget

        Direct error message"
      `);
    });

    it("includes the base message", () => {
      const error = new ClientError(undefined, "Some error");

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget

        Some error"
      `);
    });

    it("renders network error message for Error with retryable network code", () => {
      const cause = new Error("connect ECONNREFUSED 127.0.0.1:443");
      (cause as NodeJS.ErrnoException).code = "ECONNREFUSED";
      const error = new ClientError(undefined, cause);

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget

        Please check your internet connection and try again."
      `);
    });

    it("renders network error message with operation name when request is available", () => {
      const cause = new Error("getaddrinfo EAI_AGAIN");
      (cause as NodeJS.ErrnoException).code = "EAI_AGAIN";
      const error = new ClientError(FILE_SYNC_HASHES_QUERY, cause);

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget (running "FileSyncHashes")

        Please check your internet connection and try again."
      `);
    });

    it("renders network error message for ErrorEvent with retryable network code", () => {
      const innerError = new Error("connect ETIMEDOUT");
      (innerError as NodeJS.ErrnoException).code = "ETIMEDOUT";
      const cause = {
        type: "error",
        message: "Connection failed",
        error: innerError,
      };
      const error = new ClientError(undefined, cause);

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget

        Please check your internet connection and try again."
      `);
    });

    it("renders network error for ErrorEvent with operation name", () => {
      const innerError = new Error("connect ENOTFOUND");
      (innerError as NodeJS.ErrnoException).code = "ENOTFOUND";
      const cause = {
        type: "error",
        message: "Connection failed",
        error: innerError,
      };
      const error = new ClientError(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION, cause);

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget (running "RemoteFileSyncEvents")

        Please check your internet connection and try again."
      `);
    });

    it("falls through to regular Error rendering for non-network errors", () => {
      const cause = new Error("Something else broke");
      const error = new ClientError(undefined, cause);

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget

        Something else broke"
      `);
      expect(error.render()).not.toContain("network error");
    });

    it("falls through to regular ErrorEvent rendering for non-network ErrorEvents", () => {
      const cause = {
        type: "error",
        message: "WebSocket protocol error",
        error: new Error("protocol violation"),
      };
      const error = new ClientError(undefined, cause);

      expect(error.render()).toMatchInlineSnapshot(`
        "An error occurred while communicating with Gadget

        WebSocket protocol error"
      `);
      expect(error.render()).not.toContain("network error");
    });
  });
});

describe("AuthenticationError", () => {
  it("has IsBug.NO", () => {
    const error = new AuthenticationError(undefined);

    expect(error.isBug).toBe(IsBug.NO);
  });

  it("renders session expiry message", () => {
    const error = new AuthenticationError(undefined);

    const rendered = error.render();

    expect(rendered).toContain("session expiring");
    expect(rendered).toContain("sign-in again");
  });

  it("includes the base communication error message", () => {
    const error = new AuthenticationError(undefined);

    const rendered = error.render();

    expect(rendered).toContain("An error occurred while communicating with Gadget");
  });
});
