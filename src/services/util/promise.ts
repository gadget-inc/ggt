import type { TimerOptions } from "node:timers";

import ms from "ms";
import { setTimeout } from "node:timers/promises";

export const delay = (duration: ms.StringValue, options?: TimerOptions): Promise<void> => setTimeout(ms(duration), undefined, options);

/**
 * Long lived references to Promises stress the garbage collector in JS.
 *
 * Instead of caching resolved Promises, we cache these little data
 * objects instead which reference the resolution or rejection of the
 * Promise, allowing the Promise object to be free'd.
 */
export class PromiseWrapper<T> {
  resolution?: T;
  rejection?: unknown;
  pendingPromise?: Promise<T>;

  constructor(promise: Promise<T>) {
    this.pendingPromise = promise;

    promise
      .then((res) => {
        this.resolution = res;
        return res;
      })
      .catch((err: unknown) => {
        this.rejection = err;
      })
      .finally(() => {
        delete this.pendingPromise;
      });
  }

  async unwrap(): Promise<T> {
    if (this.pendingPromise) {
      return await this.pendingPromise;
    } else if (this.rejection) {
      // oxlint-disable-next-line only-throw-error
      throw this.rejection;
    } else {
      return this.resolution as T;
    }
  }
}

/**
 * A promise that can be resolved or rejected from outside its callback.
 *
 * This is typically used when you want to await a promise that is
 * resolved or rejected from outside the current scope, such as from an
 * event handler.
 *
 * @example
 * const signal = new PromiseSignal();
 * process.on("SIGINT", () => {
 *  signal.resolve();
 * });
 * await signal;
 */
export class PromiseSignal<T = void> implements Promise<T> {
  readonly [Symbol.toStringTag]!: string;

  resolve!: (value: T | PromiseLike<T>) => void;
  reject!: (reason?: unknown) => void;

  private _promise: PromiseWrapper<T>;

  constructor() {
    this._promise = new PromiseWrapper<T>(
      new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
      }),
    );

    // oxlint-disable-next-line no-base-to-string
    this[Symbol.toStringTag] = String(this._promise.pendingPromise);
  }

  // oxlint-disable-next-line no-thenable
  then<R = T, E = never>(
    onfulfilled?: (value: T) => R | PromiseLike<R>,
    onrejected?: (reason: unknown) => E | PromiseLike<E>,
  ): Promise<R | E> {
    return this._promise.unwrap().then(onfulfilled, onrejected);
  }

  catch<E = never>(onrejected?: (reason: unknown) => E | PromiseLike<E>): Promise<T | E> {
    return this._promise.unwrap().catch(onrejected);
  }

  finally(onfinally?: () => void): Promise<T> {
    return this._promise.unwrap().finally(onfinally);
  }
}
