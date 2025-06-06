import { inspect } from "node:util";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import * as root from "../src/commands/root.js";
import { ggt } from "../src/ggt.js";
import * as command from "../src/services/command/command.js";
import * as report from "../src/services/output/report.js";
import { noop } from "../src/services/util/function.js";
import { isAbortError } from "../src/services/util/is.js";
import * as json from "../src/services/util/json.js";
import { PromiseSignal } from "../src/services/util/promise.js";
import type { AnyFunction } from "../src/services/util/types.js";
import { testCtx } from "./__support__/context.js";
import { mock } from "./__support__/mock.js";
import { expectStdout } from "./__support__/output.js";
import { expectProcessExit } from "./__support__/process.js";

describe("ggt", () => {
  beforeEach(() => {
    mock(report, "installErrorHandlers", noop);
    mock(json, "installJsonExtensions", noop);
  });

  const signals = ["SIGINT", "SIGTERM"] as const;
  it.each(signals)("calls ctx.abort() on %s", async (expectedSignal) => {
    const aborted = new PromiseSignal();
    mock(command, "isCommand", () => true);
    mock(root, "run", (ctx) => {
      ctx.signal.addEventListener("abort", (reason) => {
        assert(isAbortError(reason), `reason isn't an AbortError: ${inspect(reason)}`);
        aborted.resolve();
      });
    });

    let signalled = false;
    let onSignal: AnyFunction;

    mock(process, "on", (actualSignal, cb) => {
      signalled ||= actualSignal === expectedSignal;
      expect(signals).toContain(actualSignal);
      onSignal = cb;
      return process;
    });

    await ggt(testCtx);

    expect(signalled).toBe(true);
    onSignal!();

    await aborted;
  });

  it("exits early if running in the Gadget editor's terminal", async () => {
    vi.stubEnv("GADGET_EDITOR_TERMINAL_SESSION_ID", "123");

    await expectProcessExit(() => ggt(testCtx), 1);
    expectStdout().toEqual("Running ggt in the Gadget editor's terminal is not supported.\n");
  });
});
