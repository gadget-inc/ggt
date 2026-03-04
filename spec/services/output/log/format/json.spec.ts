import { describe, expect, it } from "vitest";

import { formatJson } from "../../../../../src/services/output/log/format/json.js";
import { Level } from "../../../../../src/services/output/log/level.js";

describe("formatJson", () => {
  it("formats a basic log entry", () => {
    expect(formatJson(Level.INFO, "test", "hello world", {})).toMatchInlineSnapshot(`
      "{"level":3,"name":"test","msg":"hello world","fields":{}}
      "
    `);
  });

  it("handles empty msg", () => {
    expect(formatJson(Level.INFO, "test", "", {})).toMatchInlineSnapshot(`
      "{"level":3,"name":"test","msg":"","fields":{}}
      "
    `);
  });

  it("handles undefined msg", () => {
    expect(formatJson(Level.INFO, "test", undefined as any, {})).toMatchInlineSnapshot(`
      "{"level":3,"name":"test","msg":"","fields":{}}
      "
    `);
  });

  it("strips ANSI from msg", () => {
    const ansiRed = "\u001B[31m" + "red text" + "\u001B[0m";
    expect(formatJson(Level.INFO, "test", ansiRed, {})).toMatchInlineSnapshot(`
      "{"level":3,"name":"test","msg":"red text","fields":{}}
      "
    `);
  });

  it("serializes Set to Array in fields", () => {
    expect(formatJson(Level.INFO, "test", "msg", { items: new Set(["a", "b", "c"]) })).toMatchInlineSnapshot(`
      "{"level":3,"name":"test","msg":"msg","fields":{"items":["a","b","c"]}}
      "
    `);
  });

  it("serializes Map to Object in fields", () => {
    expect(
      formatJson(Level.INFO, "test", "msg", {
        mapping: new Map([
          ["key1", "value1"],
          ["key2", "value2"],
        ]),
      }),
    ).toMatchInlineSnapshot(`
      "{"level":3,"name":"test","msg":"msg","fields":{"mapping":{"key1":"value1","key2":"value2"}}}
      "
    `);
  });

  it("serializes nested objects in fields", () => {
    expect(formatJson(Level.INFO, "test", "msg", { nested: { deep: { value: 42 } } })).toMatchInlineSnapshot(`
      "{"level":3,"name":"test","msg":"msg","fields":{"nested":{"deep":{"value":42}}}}
      "
    `);
  });

  it("strips ANSI from string field values", () => {
    const ansiGreen = "\u001B[32m" + "green" + "\u001B[0m";
    expect(formatJson(Level.INFO, "test", "msg", { colored: ansiGreen })).toMatchInlineSnapshot(`
      "{"level":3,"name":"test","msg":"msg","fields":{"colored":"green"}}
      "
    `);
  });
});
