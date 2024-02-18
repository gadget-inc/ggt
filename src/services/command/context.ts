import type { EmptyObject } from "type-fest";
import type { RootArgs } from "../../commands/root.js";
import type { App, Environment } from "../app/app.js";
import { createLogger, type Logger } from "../output/log/logger.js";
import type { StructuredLoggerOptions } from "../output/log/structured.js";
import type { User } from "../user/user.js";
import { defaults, pick } from "../util/object.js";
import { PromiseSignal } from "../util/promise.js";
import type { AnyVoid } from "../util/types.js";
import { parseArgs, type ArgsDefinition, type ArgsDefinitionResult, type ParseArgsOptions } from "./arg.js";
import type { AvailableCommand } from "./command.js";

/**
 * Represents the options that can be passed to {@linkcode Context.init}.
 */
export type ContextInit<Args extends ArgsDefinition> = ParseArgsOptions &
  StructuredLoggerOptions & {
    /**
     * The command that this context is running.
     */
    command?: AvailableCommand;

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
   * The callbacks that will be called when this context is aborted.
   */
  #onAborts: OnAbort[] = [];

  /**
   * The parent context, if any.
   */
  #parent?: Context<ArgsDefinition, ParentArgs>;

  /**
   * The command that this context is running.
   */
  #command?: AvailableCommand;

  /**
   * The user who is running this command, if any.
   */
  #user?: User;

  /**
   * The app this command is running against, if any.
   */
  #app?: App;

  /**
   * The environment this command is running against, if any.
   */
  #env?: Environment;

  private constructor({
    parent,
    command,
    args,
    log,
  }: {
    parent?: Context<ArgsDefinition, ParentArgs>;
    command?: AvailableCommand;
    args: ArgsDefinitionResult<ThisArgs>;
    log: Logger;
  }) {
    super();
    this.args = args;
    this.#log = log;
    this.#parent = parent;
    this.#command = command;

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
            error = e;
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

  get command(): AvailableCommand | "root" {
    return this.#command ?? this.#parent?.command ?? "root";
  }

  get user(): User | undefined {
    return this.#user ?? this.#parent?.user;
  }

  set user(user: User) {
    this.#user = user;
    if (this.#parent) {
      this.#parent.user = user;
    }

    this.#log = this.#log.child({
      fields: { user: { id: user.id } },
      devFields: { user },
    });
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  get app(): App | undefined {
    return this.#app ?? this.#parent?.app;
  }

  set app(app: App) {
    this.#app = app;
    if (this.#parent) {
      this.#parent.app = app;
    }

    this.#log = this.#log.child({ fields: { app } });
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  get env(): Environment | undefined {
    return this.#env ?? this.#parent?.env;
  }

  set env(env: Environment) {
    this.#env = env;
    if (this.#parent) {
      this.#parent.env = env;
    }

    this.#log = this.#log.child({ fields: { env } });
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
    });
  }

  /**
   * Returns a new context that is a child of the current context.
   *
   * @see {@linkcode ChildContextInit}
   */
  child<ChildArgs extends ArgsDefinition = EmptyObject>({
    parse: spec,
    command = this.#command,
    ...options
  }: ChildContextInit<ChildArgs, ArgsDefinitionResult<ThisArgs>>): Context<ChildArgs, ThisArgs> {
    const ctx = new Context<ChildArgs, ThisArgs>({
      parent: this,
      command,
      args: {
        ...this.args,
        ...options.overwrite,
        ...(spec
          ? parseArgs(spec, defaults(pick(options, ["argv", "permissive", "stopAtPositional"]), { argv: this.args._ }))
          : ({} as ArgsDefinitionResult<ChildArgs>)),
      },
      log: this.log.child(pick(options, ["name", "fields", "devFields"])),
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

  override async abort(reason?: unknown): Promise<void> {
    super.abort(reason);
    await this.done;
  }
}

/**
 * A callback that will be called when the context is aborted.
 */
export type OnAbort = (reason: unknown) => AnyVoid;
