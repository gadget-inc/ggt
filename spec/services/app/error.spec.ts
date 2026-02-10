import { describe, expect, it } from "vitest";

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

      const rendered = error.render();

      expect(rendered).toContain("Gadget responded with the following error:");
      expect(rendered).toContain("Field 'user' not found");
    });

    it("formats multiple GraphQL errors", () => {
      const error = new ClientError(undefined, [
        { message: "Error 1", extensions: {} },
        { message: "Error 2", extensions: {} },
      ]);

      const rendered = error.render();

      expect(rendered).toContain("Gadget responded with the following errors:");
      expect(rendered).toContain("Error 1");
      expect(rendered).toContain("Error 2");
    });

    it("deduplicates GraphQL errors with same message", () => {
      const error = new ClientError(undefined, [
        { message: "Duplicate error", extensions: {} },
        { message: "Duplicate error", extensions: {} },
        { message: "Other error", extensions: {} },
      ]);

      const rendered = error.render();

      // Should only appear once
      const duplicateCount = (rendered.match(/Duplicate error/g) || []).length;
      expect(duplicateCount).toBe(1);
      expect(rendered).toContain("Other error");
    });

    it("renders CloseEvent message", () => {
      const error = new ClientError(undefined, {
        type: "close",
        code: 1006,
        reason: "Connection lost",
        wasClean: false,
      });

      const rendered = error.render();

      expect(rendered).toContain("The connection to Gadget closed unexpectedly.");
    });

    it("renders ErrorEvent message", () => {
      const error = new ClientError(undefined, {
        type: "error",
        message: "WebSocket connection failed",
        error: undefined,
      });

      const rendered = error.render();

      expect(rendered).toContain("WebSocket connection failed");
    });

    it("renders Error message", () => {
      const error = new ClientError(undefined, new Error("Something broke"));

      const rendered = error.render();

      expect(rendered).toContain("Something broke");
    });

    it("renders single string array element", () => {
      const error = new ClientError(undefined, ["Only one error"]);

      const rendered = error.render();

      expect(rendered).toContain("Only one error");
    });

    it("renders multiple string array elements joined by comma", () => {
      const error = new ClientError(undefined, ["Error A", "Error B", "Error C"]);

      const rendered = error.render();

      expect(rendered).toContain("Error A, Error B, Error C");
    });

    it("renders string cause directly", () => {
      const error = new ClientError(undefined, "Direct error message");

      const rendered = error.render();

      expect(rendered).toContain("Direct error message");
    });

    it("includes the base message", () => {
      const error = new ClientError(undefined, "Some error");

      const rendered = error.render();

      expect(rendered).toContain("An error occurred while communicating with Gadget");
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
