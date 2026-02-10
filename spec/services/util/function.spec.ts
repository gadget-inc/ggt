import { describe, expect, it, vi } from "vitest";

import { debounce, memo } from "../../../src/services/util/function.js";

describe("debounce", () => {
  it("calls the function after the specified delay", () => {
    vi.useFakeTimers();

    const delayMS = 1000;
    const fn = vi.fn();
    const debouncedFunction = debounce(delayMS, fn);

    debouncedFunction();
    expect(fn).not.toBeCalled();

    vi.advanceTimersByTime(delayMS - 1);
    expect(fn).not.toBeCalled();

    vi.advanceTimersByTime(delayMS);
    expect(fn).toBeCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("immediately calls the function if flush is called", () => {
    vi.useFakeTimers();

    const delayMS = 1000;
    const fn = vi.fn();
    const debouncedFunction = debounce(delayMS, fn);

    debouncedFunction();
    expect(fn).not.toBeCalled();

    debouncedFunction.flush();
    expect(fn).toBeCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("doesn't call the function when flush is called if the function hasn't been called yet", () => {
    vi.useFakeTimers();

    const delayMS = 1000;
    const mockFunction = vi.fn();
    const debouncedFunction = debounce(delayMS, mockFunction);

    debouncedFunction.flush();
    expect(mockFunction).not.toBeCalled();

    vi.advanceTimersByTime(delayMS);
    expect(mockFunction).not.toBeCalled();
  });
});

describe("memo", () => {
  it("caches the functions result", () => {
    const fn = vi.fn((x) => x * 2);
    const memoizedFunction = memo(fn);

    const result1 = memoizedFunction(2);
    const result2 = memoizedFunction(2);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(result2);
    expect(result1).toEqual(4);
  });

  it("clears cached results when clear is called", () => {
    const fn = vi.fn((x) => x * 2);
    const memoizedFunction = memo(fn);

    const result1 = memoizedFunction(2);
    memoizedFunction.clear();

    const result2 = memoizedFunction(2);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result1).toEqual(result2);
  });

  it("uses the provided key function to generate the cache key", () => {
    const fn = vi.fn((x) => x * 2);
    const memoizedFunction = memo((x: number) => String(x % 2), fn);

    const result1 = memoizedFunction(2);
    const result2 = memoizedFunction(4);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(result2);
    expect(result1).toEqual(4);

    const result3 = memoizedFunction(3);
    const result4 = memoizedFunction(5);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(result3).toEqual(result4);
    expect(result3).toEqual(6);
  });
});
