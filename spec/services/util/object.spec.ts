import { describe, expect, it } from "vitest";

import { defaults, mapValues, omit, pick } from "../../../src/services/util/object.js";

describe("defaults", () => {
  it("merges the properties of the input and default values", () => {
    const input = { a: 1, b: 2 };
    const defaultValues = { b: 3, c: 3 };

    const result = defaults(input, defaultValues);

    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("uses the default values if the input is null", () => {
    const input = null;
    const defaultValues = { a: 1, b: 2 };

    const result = defaults(input, defaultValues);

    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("uses the default values if the input is undefined", () => {
    const input = undefined;
    const defaultValues = { a: 1, b: 2 };

    const result = defaults(input, defaultValues);

    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("uses the default values if the input has undefined properties", () => {
    const input = { a: undefined } as { a: number | undefined };
    const defaultValues = { a: 1 };

    const result = defaults(input, defaultValues);

    expect(result).toEqual({ a: 1 });
  });

  it("does not overwrite falsy values like false/0/empty string", () => {
    const input = { a: false, b: 0, c: "" } as { a: boolean; b: number; c: string };
    const defaultValues = { a: true, b: 1, c: "x" };

    const result = defaults(input, defaultValues);

    expect(result).toEqual({ a: false, b: 0, c: "" });
  });

  it("doesn't modify the input object", () => {
    const input = { a: 1, b: 2 };
    const defaultValues = { b: 3, c: 4 };

    defaults(input, defaultValues);

    expect(input).toEqual({ a: 1, b: 2 });
  });
});

describe("pick", () => {
  it("returns only the specified properties from the original object", () => {
    const object = { a: 1, b: 2, c: 3 };
    const keys = ["a", "c"] as const;

    const result = pick(object, keys);

    expect(result).toEqual({ a: 1, c: 3 });
  });

  it("does not modify the original object", () => {
    const object = { a: 1, b: 2, c: 3 };
    const keys = ["a", "c"] as const;

    pick(object, keys);

    expect(object).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("returns an empty object if no keys are specified", () => {
    const object = { a: 1, b: 2, c: 3 };
    const keys = [] as const;

    const result = pick(object, keys);

    expect(result).toEqual({});
  });
});

describe("omit", () => {
  it("returns an object without the specified properties from the original object", () => {
    const object = { a: 1, b: 2, c: 3 };
    const keys = ["a", "c"] as const;

    const result = omit(object, keys);

    expect(result).toEqual({ b: 2 });
  });

  it("does not modify the original object", () => {
    const object = { a: 1, b: 2, c: 3 };
    const keys = ["a", "c"] as const;

    omit(object, keys);

    expect(object).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("returns a copy of the original object if no keys are specified", () => {
    const object = { a: 1, b: 2, c: 3 };
    const keys = [] as const;

    const result = omit(object, keys);

    // The result should be a copy of the original object
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe("mapValues", () => {
  it("maps the values of the original object to a new set of values", () => {
    const object = { a: 1, b: 2, c: 3 };
    const fn = (value: number): number => value * 2;

    const result = mapValues(object, fn);

    expect(result).toEqual({ a: 2, b: 4, c: 6 });
  });

  it("does not modify the original object", () => {
    const object = { a: 1, b: 2, c: 3 };
    const fn = (value: number): number => value * 2;

    mapValues(object, fn);

    expect(object).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("returns an empty object if the input object is empty", () => {
    const object: Record<string, number> = {};
    const fn = (value: number): number => value * 2;

    const result = mapValues(object, fn);

    expect(result).toEqual({});
  });
});
