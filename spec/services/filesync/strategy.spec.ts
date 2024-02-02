import { describe, expect, it } from "vitest";
import { ArgError } from "../../../src/services/command/arg.js";
import { FileSyncArgs } from "../../../src/services/filesync/filesync.js";
import { FileSyncStrategy, getFileSyncStrategy, validateFileSyncStrategy } from "../../../src/services/filesync/strategy.js";
import { makeContext } from "../../__support__/context.js";

const strategies = ["--push", "--pull", "--merge"] as const;

describe("validateFileSyncStrategy", () => {
  const cases: [string, string][] = [];
  for (const strategy of strategies) {
    for (const conflicting of strategies.filter((s) => s !== strategy)) {
      cases.push([strategy, conflicting]);
    }
  }

  it.each(cases)("throws an ArgError when %s and %s are used together", (strategy, conflicting) => {
    const ctx = makeContext({ parse: FileSyncArgs, argv: ["sync", strategy, conflicting] });
    expect(() => validateFileSyncStrategy(ctx)).toThrow(ArgError);
  });
});

describe("getFileSyncStrategy", () => {
  const cases: [FileSyncStrategy | undefined, string][] = [];
  for (const strategy of strategies) {
    // @ts-expect-error - it's a test
    cases.push([FileSyncStrategy[strategy.slice(2).toUpperCase()], strategy]);
  }

  it.each(cases)('returns "%s" when %s is passed', (expected, strategy) => {
    const ctx = makeContext({ parse: FileSyncArgs, argv: ["sync", strategy] });
    expect(getFileSyncStrategy(ctx)).toBe(expected);
  });

  it("returns undefined when no strategy is passed", () => {
    const ctx = makeContext({ parse: FileSyncArgs, argv: ["sync"] });
    expect(getFileSyncStrategy(ctx)).toBeUndefined();
  });
});
