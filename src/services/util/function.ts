/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable func-style */
import mimicFunction from "mimic-fn";
import assert from "node:assert";
import type { SetReturnType } from "type-fest";
import { isFunction } from "./is.js";
import { type AnyFunction } from "./types.js";

const memoizedFns = new Set<MemoizedFn>();

/**
 * A function that has been wrapped by {@linkcode memo}.
 */
export type MemoizedFn<Fn extends AnyFunction = AnyFunction> = Fn & {
  /**
   * Clears the cache of the memoized function.
   */
  clear: () => void;
};

/**
 * A function that returns the first argument as a string.
 *
 * Used as the default key function for {@linkcode memo}.
 */
export const MemoFirstArg = (...args: any[]): string => String(args[0]);

/**
 * A function that returns all arguments as a string.
 *
 * Useful for memoizing functions that accept a variable number of
 * arguments.
 */
export const MemoAllArgs = (...args: any[]): string => args.map(String).join(":");

/**
 * Creates a memoized version of the provided function.
 *
 * The memoized function caches the results of previous calls and
 * returns the cached result when the first argument matches a previous
 * call. Subsequent arguments are ignored.
 *
 * @param fn - The function to memoize.
 * @see MemoFirstArg
 */
export function memo<Fn extends AnyFunction>(fn: Fn): MemoizedFn<Fn>;

/**
 * Creates a memoized version of the provided function.
 *
 * The memoized function caches the results of previous calls and
 * returns the cached result when the key returned by `keyFn` matches
 * a previous call.
 *
 * @param keyFn - A function that returns a key for the arguments.
 * @param fn - The function to memoize.
 */
export function memo<Fn extends AnyFunction, KeyFn extends (...args: Parameters<Fn>) => string>(keyFn: KeyFn, fn: Fn): MemoizedFn<Fn>;

// eslint-disable-next-line jsdoc/require-jsdoc
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

/**
 * Clears the cache of all memoized functions.
 */
export const clearMemoized = (): void => {
  for (const memoized of memoizedFns) {
    memoized.clear();
  }
};

/**
 * A function that has been wrapped by {@linkcode debounce}.
 */
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
 * @param delayMS - The number of milliseconds to delay.
 * @param fn - The function to be debounced.
 * @returns A debounced version of the provided function.
 */
export const debounce = <F extends (...args: unknown[]) => void>(delayMS: number, fn: F): DebouncedFunc<F> => {
  let timerId: NodeJS.Timeout | undefined;
  let upcomingCall: (() => void) | undefined;

  const debounced = ((...args) => {
    upcomingCall = () => {
      upcomingCall = undefined;
      timerId = undefined;
      fn(...args);
    };

    clearTimeout(timerId);
    timerId = setTimeout(upcomingCall, delayMS);
  }) as DebouncedFunc<F>;

  debounced.flush = () => {
    if (upcomingCall) {
      upcomingCall();
    }
  };

  mimicFunction(debounced, fn);

  return debounced;
};

/**
 * A function that has been wrapped by {@linkcode debounce}.
 */
export type DebouncedAsyncFunc<Fn extends (...args: unknown[]) => Promise<void>> = SetReturnType<Fn, void> & {
  /**
   * Invokes the function if it is waiting to stop being called.
   */
  flush: () => Promise<void>;
};

/**
 * Creates a debounced function that delays invoking the provided
 * function until after `delayMS` milliseconds have elapsed since the
 * last time it was invoked.
 *
 * @param delayMS - The number of milliseconds to delay.
 * @param fn - The function to be debounced.
 * @returns A debounced version of the provided function.
 */
export const debounceAsync = <F extends (...args: unknown[]) => Promise<void>>(delayMS: number, fn: F): DebouncedAsyncFunc<F> => {
  let timerId: NodeJS.Timeout | undefined;
  let nextCall: (() => Promise<void>) | undefined;
  let pendingPromise: Promise<void> | undefined;

  const debouncedAsync = ((...args) => {
    nextCall = () => {
      nextCall = undefined;
      timerId = undefined;

      if (pendingPromise) {
        pendingPromise = pendingPromise
          .then(() => fn(...args))
          .catch(noop)
          .finally(() => (pendingPromise = undefined));
      } else {
        pendingPromise = fn(...args)
          .catch(noop)
          .finally(() => (pendingPromise = undefined));
      }

      return pendingPromise;
    };

    clearTimeout(timerId);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    timerId = setTimeout(nextCall, delayMS);
  }) as DebouncedAsyncFunc<F>;

  debouncedAsync.flush = async () => {
    if (nextCall) {
      await nextCall();
    }
  };

  mimicFunction(debouncedAsync, fn);

  return debouncedAsync;
};

/**
 * Either a value or a function that returns a value.
 */
export type Thunk<T> = T | (() => T);

/**
 * Wraps a value in a thunk (a function that returns a value). If the
 * value is already a function, it is returned as is.
 *
 * @param val - The value or function to wrap.
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
 * @param val - The value or thunk to unwrap.
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
export const noop = (..._args: any[]): void => {};

/**
 * A function that does nothing and returns `this`.
 */
export const noopThis = function <T>(this: T, ..._args: any[]): T {
  return this;
};

/**
 * A function that does nothing and returns a function that does nothing.
 */
export const noopNoop = (..._args: any[]): typeof noop => {
  return noop;
};
