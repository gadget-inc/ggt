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

describe("Context.child", () => {
  it("child context is aborted when parent is aborted", () => {
    const parent = Context.init({ name: "parent" });
    const child = parent.child({ name: "child" });

    parent.abort("reason");

    expect(child.signal.aborted).toBe(true);
  });

  it("aborting child does not abort parent", () => {
    const parent = Context.init({ name: "parent" });
    const child = parent.child({ name: "child" });

    child.abort("reason");

    expect(parent.signal.aborted).toBe(false);
  });
});

describe("Context.onAbort ordering and error handling", () => {
  it("calls onAbort callbacks in reverse order (LIFO)", async () => {
    const order: number[] = [];

    const ctx = Context.init({ name: "test" });
    ctx.onAbort(() => void order.push(1));
    ctx.onAbort(() => void order.push(2));
    ctx.onAbort(() => void order.push(3));

    ctx.abort();
    await ctx.done;

    expect(order).toEqual([3, 2, 1]);
  });

  it("continues executing remaining callbacks when one throws", async () => {
    const called: string[] = [];

    const ctx = Context.init({ name: "test" });
    ctx.onAbort(() => void called.push("A"));
    ctx.onAbort(() => {
      called.push("B");
      throw new Error("B failed");
    });
    ctx.onAbort(() => void called.push("C"));

    ctx.abort();
    await ctx.done.catch(() => {
      /* expected */
    });

    expect(called).toEqual(["C", "B", "A"]);
  });
});

describe("Context.done", () => {
  it("resolves after all callbacks finish", async () => {
    let callbackFinished = false;

    const ctx = Context.init({ name: "test" });
    ctx.onAbort(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      callbackFinished = true;
    });

    ctx.abort();
    await ctx.done;

    expect(callbackFinished).toBe(true);
  });

  it("rejects if a callback throws", async () => {
    const error = new Error("callback error");

    const ctx = Context.init({ name: "test" });
    ctx.onAbort(() => {
      throw error;
    });

    ctx.abort();

    await expect(ctx.done).rejects.toThrow(error);
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
