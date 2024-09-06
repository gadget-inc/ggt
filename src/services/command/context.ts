import { createLogger, type Logger } from "../output/log/logger.js";
import type { StructuredLoggerOptions } from "../output/log/structured.js";
import { PromiseSignal } from "../util/promise.js";
import type { AnyVoid } from "../util/types.js";

/**
 * Represents the context of a command-line operation.
 */
export class Context extends AbortController {
  /**
   * A promise that resolves when the context is aborted and all the
   * registered onAbort callbacks have finished.
   */
  readonly done = new PromiseSignal<void>();

  /**
   * The logger for the current context.
   */
  #log: Logger;

  /**
   * The values that have been set on this context.
   */
  #values: Record<symbol, unknown>;

  /**
   * The callbacks that will be called when this context is aborted.
   */
  #onAborts: OnAbort[] = [];

  private constructor({ log, values }: { log: Logger; values: Record<symbol, unknown> }) {
    super();
    this.#log = log;
    this.#values = values;

    // in case this context is ...spread into another object
    this.abort = this.abort.bind(this);
    this.child = this.child.bind(this);
    this.onAbort = this.onAbort.bind(this);

    // when the context is aborted, call all the registered callbacks
    this.signal.addEventListener(
      "abort",
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async () => {
        let error: unknown;

        // call the callbacks in reverse order, like go's defer
        for (const callback of this.#onAborts.reverse()) {
          try {
            await callback(this.signal.reason);
          } catch (e: unknown) {
            error ??= e;
            this.log.error("error during abort", { error });
          }
        }

        if (error) {
          this.done.reject(error);
        } else {
          this.done.resolve();
        }
      },
    );
  }

  /**
   * A {@linkcode Logger} that can print to stdout and log structured
   * messages to stderr.
   */
  get log(): Logger {
    return this.#log;
  }

  /**
   * Initializes a new context.
   */
  static init(options: StructuredLoggerOptions): Context {
    return new Context({
      log: createLogger(options),
      values: {},
    });
  }

  get(key: symbol): unknown {
    return this.#values[key];
  }

  set(key: symbol, value: unknown): void {
    this.#values[key] = value;
  }

  /**
   * Returns a new context that is a child of the current context.
   *
   * @see {@linkcode ContextInit}
   */
  child(options: StructuredLoggerOptions): Context {
    const ctx = new Context({
      log: this.log.child(options),
      values: this.#values,
    });

    this.onAbort(() => ctx.abort());

    return ctx;
  }

  /**
   * Registers a callback that will be called when the context is
   * aborted (e.g. when the user presses Ctrl+C).
   *
   * @param callback - The callback to call when the context is aborted.
   */
  onAbort(callback: OnAbort): void {
    this.#onAborts.push(callback);
  }
}

/**
 * A callback that will be called when the context is aborted.
 */
export type OnAbort = (reason: unknown) => AnyVoid;
