import type arg from "arg";
import assert from "node:assert";
import type { EmptyObject } from "type-fest";
import type { rootArgs } from "../../commands/root.js";
import { createLogger, type Logger } from "../output/log/logger.js";
import { isFunction } from "../util/is.js";
import type { AnyVoid } from "../util/types.js";
import { parseArgs, type ArgsSpec, type ArgsSpecResult } from "./arg.js";

/**
 * Represents the context of a command-line operation.
 */
export class Context<
  Args extends ArgsSpec = ArgsSpec,
  ParentArgs extends ArgsSpec = typeof rootArgs,
  AllArgs extends ArgsSpec = Args & ParentArgs,
> extends AbortController {
  /**
   * The parsed command-line arguments for the current command and
   * any parent commands.
   */
  readonly args: ArgsSpecResult<AllArgs>;

  /**
   * A logger instance that can be used to log messages.
   *
   * This logger's name is set the name of the command that is being
   * executed.
   */
  readonly log: Logger;

  private constructor({ args, name = "context" }: { args: ArgsSpecResult<AllArgs>; name?: string }) {
    super();
    this.args = args;
    this.log = createLogger({ name, fields: { args: this.args } });
  }

  /**
   * Initializes a new context.
   *
   * @param options - The options to use.
   * @param options.args - The arguments to parse.
   * @param options.name - The name of the command that is being executed.
   */
  static init<Args extends ArgsSpec = ArgsSpec>({
    args: spec,
    name,
    ...options
  }: { args: Args; name?: string } & arg.Options): Context<Args, EmptyObject> {
    const args = parseArgs(spec, options);
    return new Context({ args, name });
  }

  /**
   * Extends the current context with more arguments.
   *
   * @param options - The options to use.
   * @param options.args - The arguments to parse.
   * @param options.name - The name of the command that is being executed.
   */
  extend<Args extends ArgsSpec>({ args: spec, name, ...options }: { args: Args; name?: string } & arg.Options): Context<Args, AllArgs> {
    const args = { ...this.args, ...parseArgs(spec, { argv: this.args._, ...options }) };
    const ctx = new Context<Args, AllArgs>({ args, name });
    this.onAbort(() => ctx.abort());
    return ctx;
  }

  /**
   * Clones the current context and optionally overrides its name and
   * arguments.
   *
   * @param options - The options to use.
   * @param options.args - The arguments to override.
   * @param options.name - The name to override.
   */
  clone({ args, name }: { args?: Partial<ArgsSpecResult<AllArgs>>; name?: string }): Context<Args, ParentArgs, AllArgs> {
    const ctx = new Context<Args, ParentArgs, AllArgs>({ args: { ...args, ...this.args }, name });
    this.onAbort(() => ctx.abort());
    return ctx;
  }

  /**
   * Registers a callback that will be called when the context is
   * aborted (e.g. when the user presses Ctrl+C).
   *
   * @param callback - The callback to call when the context is aborted.
   */
  onAbort(callback: OnAbort): void;

  /**
   * Registers a callback that will be called when the context is
   * aborted (e.g. when the user presses Ctrl+C).
   *
   * @param options.once - Whether the callback should only be called once. Defaults to `true`.
   * @param callback - The callback to call when the context is aborted.
   */
  onAbort(options: { once?: boolean }, callback: OnAbort): void;

  onAbort(callbackOrOptions: { once?: boolean } | OnAbort, callback?: OnAbort): void {
    let options = { once: true };
    if (isFunction(callbackOrOptions)) {
      callback = callbackOrOptions;
    } else {
      options = { ...options, ...callbackOrOptions };
    }

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
      options,
    );
  }
}

/**
 * A callback that will be called when the context is aborted.
 */
export type OnAbort = (reason: unknown) => AnyVoid;
