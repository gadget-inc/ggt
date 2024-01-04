import { describe, expect, it, test, vi } from "vitest";
import { Context, type OnAbort } from "../../../src/services/command/context.js";
import { mockOnce } from "../../__support__/mock.js";

describe("Context.init", () => {
  it("parses args", () => {
    const ctx = Context.init({ name: "test", parse: { "--foo": Boolean }, argv: ["--foo"] });
    expect(ctx.args["--foo"]).toBe(true);
  });
});

describe("Context.child", () => {
  it("returns a new context with additional args", () => {
    const ctx = Context.init({ name: "test", parse: { "--foo": Boolean }, argv: ["--foo", "--bar"], permissive: true });
    expect(ctx.args._).toEqual(["--bar"]);

    const child = ctx.child({ parse: { "--bar": Boolean } });
    expect(child.args["--foo"]).toBe(true);
    expect(child.args["--bar"]).toBe(true);
  });

  it("returns a new context with overwritten args", () => {
    const ctx = Context.init({ name: "test", parse: { "--foo": Boolean }, argv: ["--foo"] });
    expect(ctx.args["--foo"]).toBe(true);

    const child = ctx.child({ overwrite: { "--foo": false } });
    expect(child.args["--foo"]).toBe(false);
  });
});

describe("Context.onAbort", () => {
  it("calls the callback when the context is aborted", () => {
    const callback = vi.fn();

    const ctx = Context.init({ name: "test", parse: {}, argv: [] });
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

    const ctx = Context.init({ name: "test", parse: {}, argv: [] });
    ctx.onAbort(callback);

    await expect(onAbort!(undefined)).resolves.not.toThrow();
    expect(callback).toHaveBeenCalled();
  });

  it("only calls the callback once", () => {
    const callback = vi.fn();

    const ctx = Context.init({ name: "test", parse: {}, argv: [] });
    ctx.onAbort(callback);
    ctx.abort();
    ctx.abort();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});

test("re-assigning the context parameter doesn't change the original context", () => {
  const command = (ctxParam: Context): Context => {
    ctxParam = ctxParam.child({ parse: { "--foo": Boolean } });
    return ctxParam;
  };

  const ctx = Context.init({ name: "test", parse: {}, argv: [] });
  const otherCtx = command(ctx);

  expect(ctx).not.toBe(otherCtx);
});
