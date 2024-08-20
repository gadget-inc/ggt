import type { EmptyObject } from "type-fest";
import type { RootArgs } from "../../commands/root.js";
import { createLogger, type Logger } from "../output/log/logger.js";
import type { StructuredLoggerOptions } from "../output/log/structured.js";
import { defaults, pick } from "../util/object.js";
import { PromiseSignal } from "../util/promise.js";
import type { AnyVoid } from "../util/types.js";
import { parseArgs, type ArgsDefinition, type ArgsDefinitionResult, type ParseArgsOptions } from "./arg.js";

/**
 * Represents the options that can be passed to {@linkcode Context.init}.
 */
export type ContextInit<Args extends ArgsDefinition> = ParseArgsOptions &
  StructuredLoggerOptions & {
    /**
     * The {@linkcode ArgsDefinition} to use to parse the arguments (`argv`).
     */
    parse?: Args;
  };

/**
 * Represents the options that can be passed to {@linkcode Context.child}.
 *
 * @see {@linkcode Context.child}
 * @see {@linkcode ContextInit}
 */
export type ChildContextInit<Args extends ArgsDefinition, Parsed extends ArgsDefinitionResult<ArgsDefinition>> = Partial<
  ContextInit<Args>
> & {
  /**
   * Replaces the parsed arguments of the parent context.
   */
  overwrite?: Partial<Omit<Parsed, "_">>;
};

/**
 * Represents the context of a command-line operation.
 */
export class Context<
  Args extends ArgsDefinition = EmptyObject,
  ParentArgs extends ArgsDefinition = RootArgs,
  ThisArgs extends ArgsDefinition = ParentArgs & Args,
> extends AbortController {
  /**
   * The parsed command-line arguments for the current context and any
   * parent contexts.
   */
  readonly args: ArgsDefinitionResult<ThisArgs>;

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

  private constructor({ args, log, values }: { args: ArgsDefinitionResult<ThisArgs>; log: Logger; values: Record<symbol, unknown> }) {
    super();
    this.args = args;
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
   *
   * @see {@linkcode ContextInit}
   */
  static init<Args extends ArgsDefinition = EmptyObject>({ parse: spec, ...options }: ContextInit<Args>): Context<Args> {
    return new Context({
      args: spec ? parseArgs(spec, pick(options, ["argv", "permissive", "stopAtPositional"])) : ({} as ArgsDefinitionResult<Args>),
      log: createLogger(pick(options, ["name", "fields", "devFields"])),
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
   * @see {@linkcode ChildContextInit}
   */
  child<ChildArgs extends ArgsDefinition = EmptyObject>({
    parse: spec,
    ...options
  }: ChildContextInit<ChildArgs, ArgsDefinitionResult<ThisArgs>>): Context<ChildArgs, ThisArgs> {
    const ctx = new Context<ChildArgs, ThisArgs>({
      args: {
        ...this.args,
        ...options.overwrite,
        ...(spec
          ? parseArgs(spec, defaults(pick(options, ["argv", "permissive", "stopAtPositional"]), { argv: this.args._ }))
          : ({} as ArgsDefinitionResult<ChildArgs>)),
      },
      log: this.log.child(pick(options, ["name", "fields", "devFields"])),
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
