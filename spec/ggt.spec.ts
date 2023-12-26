import { inspect } from "node:util";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import { spyOnImplementing } from "vitest-mock-process";
import * as root from "../src/commands/root.js";
import { ggt } from "../src/ggt.js";
import * as command from "../src/services/command/command.js";
import * as report from "../src/services/output/report.js";
import { noop } from "../src/services/util/function.js";
import { isAbortError } from "../src/services/util/is.js";
import * as json from "../src/services/util/json.js";
import { PromiseSignal } from "../src/services/util/promise.js";
import type { AnyFunction } from "../src/services/util/types.js";
import { makeRootContext } from "./__support__/context.js";

describe("ggt", () => {
  beforeEach(() => {
    vi.spyOn(report, "installErrorHandlers").mockImplementation(noop);
    vi.spyOn(json, "installJsonExtensions").mockImplementation(noop);
  });

  const signals = ["SIGINT", "SIGTERM"] as const;
  it.each(signals)("calls ctx.abort() on %s", async (expectedSignal) => {
    const aborted = new PromiseSignal();
    vi.spyOn(command, "isAvailableCommand").mockReturnValueOnce(true);
    vi.spyOn(root, "command").mockImplementation((ctx) => {
      ctx.signal.addEventListener("abort", (reason) => {
        assert(isAbortError(reason), `reason isn't an AbortError: ${inspect(reason)}`);
        aborted.resolve();
      });
    });

    let signalled = false;
    let onSignal: AnyFunction;

    spyOnImplementing(process, "once", (actualSignal, cb) => {
      signalled ||= actualSignal === expectedSignal;
      expect(signals).toContain(actualSignal);
      onSignal = cb;
      return process;
    });

    process.argv = ["node", "ggt", "test"];
    await ggt(makeRootContext());

    expect(signalled).toBe(true);
    onSignal!();

    await aborted;
  });
});
