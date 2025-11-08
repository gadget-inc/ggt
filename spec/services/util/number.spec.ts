import { randomInt } from "node:crypto";
import { describe, expect, it } from "vitest";
import { clamp, parseNumber } from "../../../src/services/util/number.js";

describe("parseNumber", () => {
  it.each([
    ["0", 0],
    ["1", 1],
    ["10", 10],
    ["100", 100],
    ["1.1", 1.1],
    ["10.1", 10.1],
    ["100.1", 100.1],
    ["-1", -1],
    ["-10", -10],
    ["-100", -100],
    ["-1.1", -1.1],
    ["-10.1", -10.1],
    ["-100.1", -100.1],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
  ])("parses %s as %d", (input, output) => {
    expect(parseNumber(input)).toBe(output);
  });

  it.each(["what", "nope", "", null, undefined])("parses %s as defaultValue", (value) => {
    const defaultValue = randomInt(100);
    expect(parseNumber(value, defaultValue)).toBe(defaultValue);
  });
});

describe("clamp", () => {
  it("clamps the number within the specified range", () => {
    expect(clamp(5, 1, 10)).toEqual(5);
    expect(clamp(0, 1, 10)).toEqual(1);
    expect(clamp(15, 1, 10)).toEqual(10);
  });

  it("handles negative numbers correctly", () => {
    expect(clamp(-5, -10, 10)).toEqual(-5);
    expect(clamp(-15, -10, 10)).toEqual(-10);
    expect(clamp(15, -10, 10)).toEqual(10);
  });
});
