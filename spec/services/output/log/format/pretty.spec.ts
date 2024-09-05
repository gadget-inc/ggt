import { describe, expect, it } from "vitest";
import { formatPretty } from "../../../../../src/services/output/log/format/pretty.js";
import { Level } from "../../../../../src/services/output/log/level.js";
import { withEnv } from "../../../../__support__/env.js";
import { mockSystemTime } from "../../../../__support__/time.js";

describe("formatPretty", () => {
  mockSystemTime();

  it("always print trace_id key first when printing fields", () => {
    const fields = {} as Record<string, any>;

    fields["random"] = "random";
    fields["trace_id"] = "1234567890";
    fields["random2"] = "random2";

    expect(formatPretty(Level.INFO, "test", "some message", { fields })).toMatchInlineSnapshot(`
      "12:00:00 INFO test: some message
        fields:
          trace_id: 1234567890
          random: 'random'
          random2: 'random2'
      "
    `);
  });

  it("truncates objects when it has more than 10 keys", () => {
    const obj = {} as Record<string, number>;
    for (let i = 0; i < 100; i++) {
      obj[`property${i}`] = i;
    }

    expect(formatPretty(Level.INFO, "test", "some message", { obj })).toMatchInlineSnapshot(`
      "12:00:00 INFO test: some message
        obj:
          property0: 0
          property1: 1
          property2: 2
          property3: 3
          property4: 4
          property5: 5
          property6: 6
          property7: 7
          property8: 8
          property9: 9
          …: '90 more'
      "
    `);
  });

  it("truncates arrays when it has more than 10 items", () => {
    const arr = [];
    for (let i = 0; i < 100; i++) {
      arr.push(i);
    }

    expect(formatPretty(Level.INFO, "test", "some message", { arr })).toMatchInlineSnapshot(`
      "12:00:00 INFO test: some message
        arr:
          0: 0
          1: 1
          2: 2
          3: 3
          4: 4
          5: 5
          6: 6
          7: 7
          8: 8
          9: 9
          …: '90 more'
      "
    `);
  });

  it("does not truncate objects when it has less than 10 keys", () => {
    const obj = {} as Record<string, number>;
    for (let i = 0; i < 5; i++) {
      obj[`property${i}`] = i;
    }

    expect(formatPretty(Level.INFO, "test", "some message", { obj })).toMatchInlineSnapshot(`
      "12:00:00 INFO test: some message
        obj:
          property0: 0
          property1: 1
          property2: 2
          property3: 3
          property4: 4
      "
    `);
  });

  it("does not truncate arrays when it has less than 10 items", () => {
    const arr = [];
    for (let i = 0; i < 5; i++) {
      arr.push(i);
    }

    expect(formatPretty(Level.INFO, "test", "some message", { arr })).toMatchInlineSnapshot(`
      "12:00:00 INFO test: some message
        arr:
          0: 0
          1: 1
          2: 2
          3: 3
          4: 4
      "
    `);
  });

  it(`does not truncate objects when the log level is "${Level.TRACE}"`, () => {
    withEnv({ GGT_LOG_LEVEL: String(Level.TRACE) }, () => {
      const obj = {} as Record<string, number>;
      for (let i = 0; i < 20; i++) {
        obj[`property${i}`] = i;
      }

      expect(formatPretty(Level.INFO, "test", "some message", { obj })).toMatchInlineSnapshot(`
        "12:00:00 INFO test: some message
          obj:
            property0: 0
            property1: 1
            property2: 2
            property3: 3
            property4: 4
            property5: 5
            property6: 6
            property7: 7
            property8: 8
            property9: 9
            property10: 10
            property11: 11
            property12: 12
            property13: 13
            property14: 14
            property15: 15
            property16: 16
            property17: 17
            property18: 18
            property19: 19
        "
      `);
    });
  });

  it(`does not truncate arrays when the log level is "${Level.TRACE}"`, () => {
    withEnv({ GGT_LOG_LEVEL: String(Level.TRACE) }, () => {
      const arr = [];
      for (let i = 0; i < 20; i++) {
        arr.push(i);
      }

      expect(formatPretty(Level.INFO, "test", "some message", { arr })).toMatchInlineSnapshot(`
        "12:00:00 INFO test: some message
          arr:
            0: 0
            1: 1
            2: 2
            3: 3
            4: 4
            5: 5
            6: 6
            7: 7
            8: 8
            9: 9
            10: 10
            11: 11
            12: 12
            13: 13
            14: 14
            15: 15
            16: 16
            17: 17
            18: 18
            19: 19
        "
      `);
    });
  });
});
