import type arg from "arg";
import assert from "node:assert";
import type { rootArgs } from "../../commands/root.js";
import { createLogger, type Logger } from "../output/log/logger.js";
import type { AnyVoid } from "../util/function.js";
import { isFunction } from "../util/is.js";
import { parseArgs, type ArgsSpec, type ArgsSpecResult } from "./arg.js";

export class Context<
  Args extends ArgsSpec = ArgsSpec,
  ParentArgs extends ArgsSpec = typeof rootArgs,
  AllArgs extends ArgsSpec = Args & ParentArgs,
> extends AbortController {
  readonly log: Logger;

  readonly args: ArgsSpecResult<AllArgs>;

  constructor(args: Args, options?: arg.Options & { args?: ArgsSpecResult<ParentArgs>; logName?: string }) {
    super();
    if (options?.args) {
      assert(!options.argv, "argv and args cannot be used together");
      options.argv = options.args._;
    }
    this.args = { ...options?.args, ...parseArgs(args, options) } as ArgsSpecResult<AllArgs>;
    this.log = createLogger({ name: options?.logName || "context", fields: { args: this.args } });
  }

  extend<ExtendedArgs extends ArgsSpec>({
    args = {} as ExtendedArgs,
    logName,
  }: {
    args?: ExtendedArgs;
    logName?: string;
  }): Context<ExtendedArgs, AllArgs> {
    const ctx = new Context(args, { args: this.args, logName });
    this.onAbort(() => ctx.abort());
    return ctx;
  }

  onAbort(callback: OnAbort): void;
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
          this.log.error("error during cancel", { error });
        }
      },
      options,
    );
  }
}

export type OnAbort = (reason: unknown) => AnyVoid;
