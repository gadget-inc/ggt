import assert from "node:assert";
import type { EmptyObject } from "type-fest";
import type { rootArgs } from "../../commands/root.js";
import type { Fields } from "../output/log/field.js";
import { createLogger, type Logger } from "../output/log/logger.js";
import type { Thunk } from "../util/function.js";
import type { AnyVoid } from "../util/types.js";
import { parseArgs, type ArgsSpec, type ArgsSpecResult } from "./arg.js";

/**
 * Represents the options that can be passed to {@linkcode Context.init}.
 */
export type ContextInit<Args extends ArgsSpec> = {
  /**
   * The name of context. This will be used as the name of the logger.
   */
  name: string;

  /**
   * The {@linkcode ArgsSpec} to use to parse the arguments (`argv`).
   */
  parse: Args;

  /**
   * A list of arguments to parse.
   */
  argv: string[];

  /**
   * When permissive set to `true`, arg will push any unknown arguments
   * onto the "extra" argument array (`ctx.args._`) instead of throwing
   * an error about an unknown flag.
   *
   * @default false
   */
  permissive?: boolean;

  /**
   * When stopAtPositional is set to true, context will stop parsing at
   * the first positional argument.
   *
   * @default false
   */
  stopAtPositional?: boolean;

  /**
   * Fields to add to the logger.
   */
  fields?: Thunk<Fields>;
};

/**
 * Represents the options that can be passed to {@linkcode Context.child}.
 *
 * @see {@linkcode Context.child}
 * @see {@linkcode ContextInit}
 */
export type ContextChildInit<Args extends ArgsSpec, Parsed extends ArgsSpecResult<ArgsSpec>> = Partial<ContextInit<Args>> & {
  /**
   * Replaces the parsed arguments of the parent context.
   */
  overwrite?: Partial<Omit<Parsed, "_">>;
};

/**
 * Represents the context of a command-line operation.
 */
export class Context<
  Args extends ArgsSpec = ArgsSpec,
  ParentArgs extends ArgsSpec = typeof rootArgs,
  ThisArgs extends ArgsSpec = Args & ParentArgs,
> extends AbortController {
  /**
   * The parsed command-line arguments for the current context and any
   * parent contexts.
   */
  readonly args: ArgsSpecResult<ThisArgs>;

  /**
   * A logger instance that can be used to log messages.
   */
  readonly log: Logger;

  private constructor({ args, log }: { args: ArgsSpecResult<ThisArgs>; log: Logger }) {
    super();
    this.args = args;
    this.log = log;

    // in case this context is ...spread into another object
    this.abort = this.abort.bind(this);
    this.child = this.child.bind(this);
    this.onAbort = this.onAbort.bind(this);
  }

  /**
   * Initializes a new context.
   *
   * @see {@linkcode ContextInit}
   */
  static init<Args extends ArgsSpec = ArgsSpec>({
    name,
    parse: spec,
    fields,
    ...argOptions
  }: ContextInit<Args>): Context<Args, EmptyObject> {
    return new Context({ args: parseArgs(spec, argOptions), log: createLogger({ name, fields }) });
  }

  /**
   * Returns a new context that is a child of the current context.
   *
   * @see {@linkcode ContextChildInit}
   */
  child<ChildArgs extends ArgsSpec>({
    parse: spec = {} as ChildArgs,
    overwrite,
    name,
    fields,
    ...argOptions
  }: ContextChildInit<ChildArgs, ArgsSpecResult<ThisArgs>>): Context<ChildArgs, ThisArgs> {
    const ctx = new Context<ChildArgs, ThisArgs>({
      args: { ...this.args, ...overwrite, ...parseArgs(spec, { argv: this.args._, ...argOptions }) },
      log: this.log.child({ name, fields }),
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
    this.signal.addEventListener(
      "abort",
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async () => {
        try {
          assert(callback, "callback must have been provided");
          await callback(this.signal.reason);
        } catch (error: unknown) {
          this.log.error("error during abort", { error });
        }
      },
    );
  }
}

/**
 * A callback that will be called when the context is aborted.
 */
export type OnAbort = (reason: unknown) => AnyVoid;
