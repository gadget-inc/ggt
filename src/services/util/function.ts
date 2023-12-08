/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable func-style */
import mimicFunction from "mimic-fn";
import assert from "node:assert";
import type { Promisable } from "type-fest";
import { isFunction } from "./is.js";

export type AnyFunction = (...args: never[]) => unknown;

export type AnyVoid = Promisable<void>;

const memoizedFns = new Set<MemoizedFn>();

export type MemoizedFn<Fn extends AnyFunction = AnyFunction> = Fn & {
  /**
   * Clears the cache.
   */
  clear: () => void;
};

export const MemoFirstArg = (...args: any[]): string => String(args[0]);
export const MemoAllArgs = (...args: any[]): string => args.map(String).join(":");

export function memo<Fn extends AnyFunction>(fn: Fn): MemoizedFn<Fn>;
export function memo<Fn extends AnyFunction, KeyFn extends (...args: Parameters<Fn>) => string>(keyFn: KeyFn, fn: Fn): MemoizedFn<Fn>;
export function memo<Fn extends AnyFunction, KeyFn extends (...args: Parameters<Fn>) => string>(
  fnOrKeyFn: Fn | KeyFn,
  fn?: Fn,
): MemoizedFn<Fn> {
  let keyFn: KeyFn;
  if (fn) {
    keyFn = fnOrKeyFn as KeyFn;
  } else {
    fn = fnOrKeyFn as Fn;
    keyFn = MemoFirstArg as unknown as KeyFn;
  }

  const cache = new Map<string, unknown>();

  const memoized = ((...args) => {
    const key = keyFn(...(args as Parameters<Fn>));
    if (cache.has(key)) {
      return cache.get(key);
    }

    assert(fn, "fn shouldn't be undefined");
    const result = fn(...args);
    cache.set(key, result);

    return result;
  }) as MemoizedFn<Fn>;

  memoized.clear = cache.clear.bind(cache);

  memoizedFns.add(memoized);

  mimicFunction(memoized, fn);

  return memoized;
}

export const clearMemoized = (): void => {
  for (const memoized of memoizedFns) {
    memoized.clear();
  }
};

export type DebouncedFunc<Fn extends (...args: unknown[]) => void> = Fn & {
  /**
   * Invokes the function if it is waiting to stop being called.
   */
  flush: () => void;
};

/**
 * Creates a debounced function that delays invoking the provided
 * function until after `delayMS` milliseconds have elapsed since the
 * last time it was invoked.
 *
 * @param delayMS The number of milliseconds to delay.
 * @param f The function to be debounced.
 * @returns A debounced version of the provided function.
 */
export const debounce = <F extends (...args: unknown[]) => void>(delayMS: number, f: F): DebouncedFunc<F> => {
  let timerId: NodeJS.Timeout | undefined;
  let upcomingCall: (() => void) | undefined;

  const debounced = ((...args) => {
    upcomingCall = () => {
      upcomingCall = undefined;
      timerId = undefined;
      f(...args);
    };

    clearTimeout(timerId);
    timerId = setTimeout(upcomingCall, delayMS);
  }) as DebouncedFunc<F>;

  debounced.flush = () => {
    if (upcomingCall) {
      upcomingCall();
    }
  };

  return debounced;
};

export type Thunk<T> = T | (() => T);

/**
 * Wraps a value in a thunk (a function that returns a value). If the
 * value is already a function, it is returned as is.
 *
 * @param val The value or function to wrap.
 * @returns A function that returns the value.
 */
export const thunk = <T>(val: T | (() => T)): (() => T) => {
  if (isFunction(val)) {
    return val;
  }
  return () => val;
};

/**
 * Unwraps a value from a thunk (a function that returns a value). If the
 * value is not a function, it is returned as is.
 *
 * @param val The value or thunk to unwrap.
 * @returns The unwrapped value.
 */
export const unthunk = <T>(val: T | (() => T)): T => {
  if (isFunction(val)) {
    return val();
  }
  return val;
};

/**
 * A function that does nothing and returns nothing.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-function
export const noop = (): void => {};

/**
 * A function that does nothing and returns `this`.
 */
export const noopThis = function <T>(this: T): T {
  return this;
};
