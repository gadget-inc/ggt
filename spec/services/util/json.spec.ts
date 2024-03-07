import { beforeEach, describe, expect, it } from "vitest";
import { installJsonExtensions, uninstallJsonExtensions } from "../../../src/services/util/json.js";

describe("installJsonExtensions", () => {
  beforeEach(() => {
    uninstallJsonExtensions();
  });

  it("adds a toJSON method to BigInt", () => {
    const bigInt = BigInt(1);
    expect(() => JSON.stringify(bigInt)).toThrowError();
    installJsonExtensions();
    expect(JSON.stringify(bigInt)).toBe('"1"');
  });

  it("adds a toJSON method to Map", () => {
    const map = new Map([["a", 1]]);
    expect(() => JSON.stringify(map)).toMatchInlineSnapshot("[Function]");
    installJsonExtensions();
    // eslint-disable-next-line quotes
    expect(JSON.stringify(map)).toMatchInlineSnapshot(`"{"a":1}"`);
  });

  it("adds a toJSON method to Set", () => {
    const set = new Set([1]);
    expect(() => JSON.stringify(set)).toMatchInlineSnapshot("[Function]");
    installJsonExtensions();
    expect(JSON.stringify(set)).toMatchInlineSnapshot('"[1]"');
  });
});
