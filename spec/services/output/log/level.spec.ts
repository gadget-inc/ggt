import { describe, expect, it } from "vitest";
import { Level, parseLevel, verbosityToLevel } from "../../../../src/services/output/log/level.js";

describe("parseLevel", () => {
  it.each([
    ["TRACE", Level.TRACE],
    ["DEBUG", Level.DEBUG],
    ["INFO", Level.INFO],
    ["WARN", Level.WARN],
    ["ERROR", Level.ERROR],

    ["trace", Level.TRACE],
    ["debug", Level.DEBUG],
    ["info", Level.INFO],
    ["warn", Level.WARN],
    ["error", Level.ERROR],

    [1, Level.TRACE],
    [2, Level.DEBUG],
    [3, Level.INFO],
    [4, Level.WARN],
    [5, Level.ERROR],

    // eslint-disable-next-line unicorn/no-null
    [null, Level.PRINT],
    [undefined, Level.PRINT],
    ["", Level.PRINT],
    ["foo", Level.PRINT],
  ])("parses %s as %s", (value, expected) => {
    expect(parseLevel(value, Level.PRINT)).toEqual(expected);
  });
});

describe("verbosityToLevel", () => {
  it.each([
    [1, Level.INFO],
    [2, Level.DEBUG],
    [3, Level.TRACE],
    [Infinity, Level.TRACE],
  ])("converts %d to %d", (value, expected) => {
    expect(verbosityToLevel(value)).toEqual(expected);
  });

  it("asserts that verbosity is positive", () => {
    expect(() => verbosityToLevel(0)).toThrow();
    expect(() => verbosityToLevel(-1)).toThrow();
    expect(() => verbosityToLevel(-Infinity)).toThrow();
    expect(() => verbosityToLevel(NaN)).toThrow();
  });
});
