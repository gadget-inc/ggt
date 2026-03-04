import { describe, expect, it } from "vitest";

import {
  isAbortError,
  isCloseEvent,
  isEEXISTError,
  isENOENTError,
  isENOTDIRError,
  isENOTEMPTYError,
  isError,
  isErrorEvent,
  isFunction,
  isGellyFile,
  isGraphQLErrors,
  isGraphQLResult,
  isJavaScriptFile,
  isNil,
  isObject,
  isString,
  isStringArray,
  isTypeScriptFile,
} from "../../../src/services/util/is.js";

describe("isNil", () => {
  it("returns true for null", () => {
    expect(isNil(null)).toBe(true);
  });

  it("returns true for undefined", () => {
    expect(isNil(undefined)).toBe(true);
  });

  it("returns false for falsy values that are not null or undefined", () => {
    expect(isNil(0)).toBe(false);
    expect(isNil("")).toBe(false);
    expect(isNil(false)).toBe(false);
    expect(isNil(NaN)).toBe(false);
  });

  it("returns false for truthy values", () => {
    expect(isNil(1)).toBe(false);
    expect(isNil("hello")).toBe(false);
    expect(isNil({})).toBe(false);
    expect(isNil([])).toBe(false);
  });
});

describe("isString", () => {
  it("returns true for strings", () => {
    expect(isString("hello")).toBe(true);
    expect(isString("")).toBe(true);
  });

  it("returns false for non-strings", () => {
    expect(isString(123)).toBe(false);
    expect(isString(null)).toBe(false);
    expect(isString(undefined)).toBe(false);
    expect(isString({})).toBe(false);
  });
});

describe("isObject", () => {
  it("returns true for objects", () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ key: "value" })).toBe(true);
    expect(isObject([])).toBe(true);
  });

  it("returns false for null", () => {
    expect(isObject(null)).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isObject("string")).toBe(false);
    expect(isObject(123)).toBe(false);
    expect(isObject(undefined)).toBe(false);
  });
});

describe("isFunction", () => {
  it("returns true for functions", () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    expect(isFunction(() => {})).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    expect(isFunction(function () {})).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    expect(isFunction(async () => {})).toBe(true);
  });

  it("returns false for non-functions", () => {
    expect(isFunction("string")).toBe(false);
    expect(isFunction({})).toBe(false);
    expect(isFunction(null)).toBe(false);
  });
});

describe("isError", () => {
  it("returns true for Error instances", () => {
    expect(isError(new Error("test"))).toBe(true);
    expect(isError(new TypeError("test"))).toBe(true);
  });

  it("returns false for non-Error values", () => {
    expect(isError("error")).toBe(false);
    expect(isError({ message: "error" })).toBe(false);
    expect(isError(null)).toBe(false);
  });
});

describe("isStringArray", () => {
  it("returns true for string arrays", () => {
    expect(isStringArray(["a", "b", "c"])).toBe(true);
    expect(isStringArray([])).toBe(true);
  });

  it("returns false for arrays with non-strings", () => {
    expect(isStringArray([1, 2, 3])).toBe(false);
    expect(isStringArray(["a", 1, "c"])).toBe(false);
  });

  it("returns false for non-arrays", () => {
    expect(isStringArray("string")).toBe(false);
    expect(isStringArray(null)).toBe(false);
  });
});

describe("isCloseEvent", () => {
  it("returns true for valid CloseEvent-like objects", () => {
    expect(
      isCloseEvent({
        type: "close",
        code: 1000,
        reason: "Normal closure",
        wasClean: true,
      }),
    ).toBe(true);
  });

  it("returns false for objects missing required properties", () => {
    expect(isCloseEvent({ type: "close" })).toBe(false);
    expect(isCloseEvent({ code: 1000 })).toBe(false);
    expect(isCloseEvent({})).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isCloseEvent(null)).toBe(false);
    expect(isCloseEvent("close")).toBe(false);
  });
});

describe("isErrorEvent", () => {
  it("returns true for valid ErrorEvent-like objects", () => {
    expect(
      isErrorEvent({
        type: "error",
        message: "Connection failed",
        error: new Error("test"),
      }),
    ).toBe(true);
  });

  it("returns true even when error is undefined", () => {
    expect(
      isErrorEvent({
        type: "error",
        message: "Connection failed",
        error: undefined,
      }),
    ).toBe(true);
  });

  it("returns false for objects missing required properties", () => {
    expect(isErrorEvent({ type: "error" })).toBe(false);
    expect(isErrorEvent({ message: "error" })).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isErrorEvent(null)).toBe(false);
    expect(isErrorEvent("error")).toBe(false);
  });
});

describe("isGraphQLResult", () => {
  it("returns true for result with data only", () => {
    expect(isGraphQLResult({ data: { user: { id: "1" } } })).toBe(true);
  });

  it("returns true for result with errors only", () => {
    expect(isGraphQLResult({ errors: [{ message: "Not found" }] })).toBe(true);
  });

  it("returns true for result with both data and errors", () => {
    expect(
      isGraphQLResult({
        data: { user: null },
        errors: [{ message: "Partial failure" }],
      }),
    ).toBe(true);
  });

  it("returns false for empty object", () => {
    expect(isGraphQLResult({})).toBe(false);
  });

  it("returns false for malformed results", () => {
    expect(isGraphQLResult({ data: "not an object" })).toBe(false);
    expect(isGraphQLResult({ errors: "not an array" })).toBe(false);
    expect(isGraphQLResult({ errors: [{ noMessage: true }] })).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isGraphQLResult(null)).toBe(false);
    expect(isGraphQLResult("result")).toBe(false);
  });
});

describe("isGraphQLErrors", () => {
  it("returns true for valid GraphQL errors array", () => {
    expect(isGraphQLErrors([{ message: "Error 1" }])).toBe(true);
    expect(isGraphQLErrors([{ message: "Error 1" }, { message: "Error 2" }])).toBe(true);
  });

  it("returns true for errors with extensions", () => {
    expect(isGraphQLErrors([{ message: "Error", extensions: { code: "NOT_FOUND" } }])).toBe(true);
  });

  it("returns false for empty array", () => {
    expect(isGraphQLErrors([])).toBe(false);
  });

  it("returns false for arrays without message property", () => {
    expect(isGraphQLErrors([{ error: "something" }])).toBe(false);
  });

  it("returns false for non-arrays", () => {
    expect(isGraphQLErrors({ message: "error" })).toBe(false);
    expect(isGraphQLErrors(null)).toBe(false);
  });
});

describe("isAbortError", () => {
  it("returns true for Error with name AbortError", () => {
    const error = new Error("Aborted");
    error.name = "AbortError";
    expect(isAbortError(error)).toBe(true);
  });

  it("returns true for Event with type abort", () => {
    const event = new Event("abort");
    expect(isAbortError(event)).toBe(true);
  });

  it("returns false for regular errors", () => {
    expect(isAbortError(new Error("Regular error"))).toBe(false);
    expect(isAbortError(new TypeError("Type error"))).toBe(false);
  });

  it("returns false for non-Error/non-Event values", () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError({ name: "AbortError" })).toBe(false);
  });
});

describe("isENOENTError", () => {
  it("returns true for objects with code ENOENT", () => {
    expect(isENOENTError({ code: "ENOENT" })).toBe(true);
    expect(isENOENTError({ code: "ENOENT", message: "File not found" })).toBe(true);
  });

  it("returns false for other error codes", () => {
    expect(isENOENTError({ code: "EACCES" })).toBe(false);
    expect(isENOENTError({ code: "ENOTEMPTY" })).toBe(false);
  });

  it("returns false for non-objects or missing code", () => {
    expect(isENOENTError(null)).toBe(false);
    expect(isENOENTError("ENOENT")).toBe(false);
    expect(isENOENTError({})).toBe(false);
  });
});

describe("isENOTEMPTYError", () => {
  it("returns true for objects with code ENOTEMPTY", () => {
    expect(isENOTEMPTYError({ code: "ENOTEMPTY" })).toBe(true);
  });

  it("returns false for other error codes", () => {
    expect(isENOTEMPTYError({ code: "ENOENT" })).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isENOTEMPTYError(null)).toBe(false);
  });
});

describe("isENOTDIRError", () => {
  it("returns true for objects with code ENOTDIR", () => {
    expect(isENOTDIRError({ code: "ENOTDIR" })).toBe(true);
  });

  it("returns false for other error codes", () => {
    expect(isENOTDIRError({ code: "ENOENT" })).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isENOTDIRError(null)).toBe(false);
  });
});

describe("isEEXISTError", () => {
  it("returns true for objects with code EEXIST", () => {
    expect(isEEXISTError({ code: "EEXIST" })).toBe(true);
  });

  it("returns false for other error codes", () => {
    expect(isEEXISTError({ code: "ENOENT" })).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isEEXISTError(null)).toBe(false);
  });
});

describe("isJavaScriptFile", () => {
  it("returns true for JavaScript file extensions", () => {
    expect(isJavaScriptFile("file.js")).toBe(true);
    expect(isJavaScriptFile("file.jsx")).toBe(true);
    expect(isJavaScriptFile("file.cjs")).toBe(true);
    expect(isJavaScriptFile("file.mjs")).toBe(true);
    expect(isJavaScriptFile("path/to/file.js")).toBe(true);
  });

  it("returns false for non-JavaScript files", () => {
    expect(isJavaScriptFile("file.ts")).toBe(false);
    expect(isJavaScriptFile("file.json")).toBe(false);
    expect(isJavaScriptFile("file.txt")).toBe(false);
    expect(isJavaScriptFile("file")).toBe(false);
  });
});

describe("isTypeScriptFile", () => {
  it("returns true for TypeScript file extensions", () => {
    expect(isTypeScriptFile("file.ts")).toBe(true);
    expect(isTypeScriptFile("file.tsx")).toBe(true);
    expect(isTypeScriptFile("file.cts")).toBe(true);
    expect(isTypeScriptFile("file.mts")).toBe(true);
    expect(isTypeScriptFile("path/to/file.ts")).toBe(true);
  });

  it("returns false for .d.ts declaration files", () => {
    expect(isTypeScriptFile("file.d.ts")).toBe(false);
    expect(isTypeScriptFile("path/to/types.d.ts")).toBe(false);
  });

  it("returns false for non-TypeScript files", () => {
    expect(isTypeScriptFile("file.js")).toBe(false);
    expect(isTypeScriptFile("file.json")).toBe(false);
    expect(isTypeScriptFile("file.txt")).toBe(false);
  });
});

describe("isGellyFile", () => {
  it("returns true for .gelly files", () => {
    expect(isGellyFile("file.gelly")).toBe(true);
    expect(isGellyFile("path/to/file.gelly")).toBe(true);
  });

  it("returns false for non-.gelly files", () => {
    expect(isGellyFile("file.js")).toBe(false);
    expect(isGellyFile("file.ts")).toBe(false);
    expect(isGellyFile("file.gel")).toBe(false);
  });
});
