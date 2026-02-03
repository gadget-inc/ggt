import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { delay, PromiseSignal, PromiseWrapper } from "../../../src/services/util/promise.js";

describe("delay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after the specified duration", async () => {
    let resolved = false;
    const promise = delay("1s").then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(999);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(resolved).toBe(true);
  });

  it("can be aborted via signal", async () => {
    const controller = new AbortController();
    const promise = delay("10s", { signal: controller.signal });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });
});

describe("PromiseWrapper", () => {
  it("stores resolution value and clears pendingPromise", async () => {
    const wrapper = new PromiseWrapper(Promise.resolve("test value"));

    expect(wrapper.pendingPromise).toBeDefined();

    const result = await wrapper.unwrap();

    // Need to wait a tick for the finally() callback to clear pendingPromise
    await Promise.resolve();

    expect(result).toBe("test value");
    expect(wrapper.resolution).toBe("test value");
    expect(wrapper.pendingPromise).toBeUndefined();
  });

  it("stores rejection value and clears pendingPromise", async () => {
    const error = new Error("test error");
    const wrapper = new PromiseWrapper(Promise.reject(error));

    expect(wrapper.pendingPromise).toBeDefined();

    await expect(wrapper.unwrap()).rejects.toThrow("test error");

    expect(wrapper.rejection).toBe(error);
    expect(wrapper.pendingPromise).toBeUndefined();
  });

  it("returns cached resolution on subsequent unwrap calls", async () => {
    let callCount = 0;
    const promise = new Promise<string>((resolve) => {
      callCount++;
      resolve("cached");
    });

    const wrapper = new PromiseWrapper(promise);

    const result1 = await wrapper.unwrap();
    const result2 = await wrapper.unwrap();
    const result3 = await wrapper.unwrap();

    expect(result1).toBe("cached");
    expect(result2).toBe("cached");
    expect(result3).toBe("cached");
    expect(callCount).toBe(1);
  });

  it("returns cached rejection on subsequent unwrap calls", async () => {
    const error = new Error("cached error");
    const wrapper = new PromiseWrapper(Promise.reject(error));

    await expect(wrapper.unwrap()).rejects.toThrow("cached error");
    await expect(wrapper.unwrap()).rejects.toThrow("cached error");
  });

  it("waits for pendingPromise if still pending", async () => {
    let resolvePromise: (value: string) => void;
    const promise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });

    const wrapper = new PromiseWrapper(promise);

    const unwrapPromise = wrapper.unwrap();

    // Still pending
    expect(wrapper.pendingPromise).toBeDefined();

    // Resolve the original promise
    resolvePromise!("delayed value");

    const result = await unwrapPromise;
    expect(result).toBe("delayed value");
  });
});

describe("PromiseSignal", () => {
  it("can be resolved from outside", async () => {
    const signal = new PromiseSignal<string>();

    signal.resolve("resolved value");

    const result = await signal;
    expect(result).toBe("resolved value");
  });

  it("can be rejected from outside", async () => {
    const signal = new PromiseSignal<string>();

    signal.reject(new Error("rejected"));

    await expect(signal).rejects.toThrow("rejected");
  });

  it("is awaitable", async () => {
    const signal = new PromiseSignal<number>();

    setTimeout(() => signal.resolve(42), 0);

    const result = await signal;
    expect(result).toBe(42);
  });

  it("supports then chaining", async () => {
    const signal = new PromiseSignal<number>();

    const doubled = signal.then((value) => value * 2);

    signal.resolve(21);

    expect(await doubled).toBe(42);
  });

  it("supports catch for rejections", async () => {
    const signal = new PromiseSignal<number>();

    const caught = signal.catch((error) => (error as Error).message);

    signal.reject(new Error("caught error"));

    expect(await caught).toBe("caught error");
  });

  it("supports finally", async () => {
    const signal = new PromiseSignal<number>();
    let finallyCalled = false;

    const withFinally = signal.finally(() => {
      finallyCalled = true;
    });

    signal.resolve(1);

    await withFinally;
    expect(finallyCalled).toBe(true);
  });

  it("supports void type (default)", async () => {
    const signal = new PromiseSignal();

    signal.resolve();

    await signal;
  });

  it("has Symbol.toStringTag", () => {
    const signal = new PromiseSignal();
    expect(signal[Symbol.toStringTag]).toBeDefined();
  });
});
