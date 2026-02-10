import { describe, expect, it, test, vi } from "vitest";

import { Context, type OnAbort } from "../../../src/services/command/context.js";
import { mockOnce } from "../../__support__/mock.js";

describe("Context.onAbort", () => {
  it("calls the callback when the context is aborted", () => {
    const callback = vi.fn();

    const ctx = Context.init({ name: "test" });
    ctx.onAbort(callback);
    ctx.abort("reason");

    expect(callback).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith("reason");
  });

  it("catches errors thrown in the callback", async () => {
    let onAbort: OnAbort | undefined = undefined;

    mockOnce(AbortSignal.prototype, "addEventListener", (_event, cb) => {
      onAbort = cb as OnAbort;
    });

    const callback = vi.fn(() => {
      throw new Error("test");
    });

    const ctx = Context.init({ name: "test" });
    ctx.onAbort(callback);

    await expect(onAbort!(undefined)).resolves.not.toThrow();
    expect(callback).toHaveBeenCalled();
  });

  it("only calls the callback once", () => {
    const callback = vi.fn();

    const ctx = Context.init({ name: "test" });
    ctx.onAbort(callback);
    ctx.abort();
    ctx.abort();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});

test("re-assigning the context parameter doesn't change the original context", () => {
  const command = (ctxParam: Context): Context => {
    ctxParam = ctxParam.child({ name: "other" });
    return ctxParam;
  };

  const ctx = Context.init({ name: "test" });
  const otherCtx = command(ctx);

  expect(ctx).not.toBe(otherCtx);
});
