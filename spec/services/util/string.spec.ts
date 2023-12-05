import { describe, expect, it } from "vitest";
import { ensureLength } from "../../../src/services/util/string.js";

describe("ensureLength", () => {
  it("should truncate the string if it is longer than the specified length", () => {
    expect(ensureLength("Hello, world!", 5)).toEqual("Hell…");
  });

  it("should pad the string with spaces if it is shorter than the specified length", () => {
    expect(ensureLength("Hello", 10)).toEqual("Hello     ");
  });

  it("should return the string unchanged if it is exactly the specified length", () => {
    expect(ensureLength("Hello, world!", 13)).toEqual("Hello, world!");
  });
});
