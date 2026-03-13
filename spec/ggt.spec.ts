import { inspect } from "node:util";

import { assert, beforeEach, describe, expect, it, vi } from "vitest";

import * as root from "../src/commands/root.ts";
import { ggt } from "../src/ggt.ts";
import * as command from "../src/services/command/command.ts";
import * as report from "../src/services/output/report.ts";
import { noop } from "../src/services/util/function.ts";
import { isAbortError } from "../src/services/util/is.ts";
import * as json from "../src/services/util/json.ts";
import { PromiseSignal } from "../src/services/util/promise.ts";
import type { AnyFunction } from "../src/services/util/types.ts";
import { testCtx } from "./__support__/context.ts";
import { mock } from "./__support__/mock.ts";
import { expectStdout } from "./__support__/output.ts";
import { expectProcessExit } from "./__support__/process.ts";

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
