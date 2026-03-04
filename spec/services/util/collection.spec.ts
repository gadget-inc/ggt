import { describe, expect, it } from "vitest";

import { compact, sortBySimilar, uniq } from "../../../src/services/util/collection.js";

describe("compact", () => {
  it("removes null and undefined values", () => {
    expect(compact([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
  });

  it("removes all falsy values", () => {
    expect(compact([0, "", false, NaN, null, undefined, 1, "hello"])).toEqual([1, "hello"]);
  });

  it("preserves truthy values", () => {
    expect(compact([1, "a", true, {}, []])).toEqual([1, "a", true, {}, []]);
  });

  it("returns empty array for all-falsy input", () => {
    expect(compact([null, undefined, 0, "", false])).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(compact([])).toEqual([]);
  });
});

describe("uniq", () => {
  it("removes duplicate values", () => {
    expect(uniq([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  it("preserves order of first occurrence", () => {
    expect(uniq([3, 1, 2, 1, 3, 2])).toEqual([3, 1, 2]);
  });

  it("works with strings", () => {
    expect(uniq(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for empty input", () => {
    expect(uniq([])).toEqual([]);
  });

  it("returns same array if no duplicates", () => {
    expect(uniq([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe("sortBySimilar", () => {
  it("returns closest match first for typos", () => {
    const result = sortBySimilar("dve", ["dev", "deploy", "push", "pull"]);
    expect(result[0]).toBe("dev");
  });

  it("returns closest match first for misspellings", () => {
    // cspell:disable-next-line -- testing typo matching
    const result = sortBySimilar("depoly", ["dev", "deploy", "push", "pull"]);
    expect(result[0]).toBe("deploy");
  });

  it("returns exact match first", () => {
    const result = sortBySimilar("push", ["dev", "deploy", "push", "pull"]);
    expect(result[0]).toBe("push");
  });

  it("sorts all options by similarity", () => {
    const result = sortBySimilar("dev", ["deploy", "dev", "status"]);
    expect(result).toEqual(["dev", "deploy", "status"]);
  });

  it("returns tuple type with closest as first element", () => {
    const result = sortBySimilar("test", ["testing", "best", "rest"]);
    // TypeScript should infer [closest: string, ...sorted: string[]]
    const [closest, ...rest] = result;
    // "best" and "rest" are both 1 edit away from "test", "testing" is 3 edits away
    expect(closest).toBe("best");
    expect(rest).toEqual(["rest", "testing"]);
  });

  it("throws assertion error for empty options array", () => {
    expect(() => sortBySimilar("test", [])).toThrow("options must not be empty");
  });

  it("handles single option", () => {
    const result = sortBySimilar("anything", ["only"]);
    expect(result).toEqual(["only"]);
  });
});
