import arg from "arg";
import assert from "node:assert";
import { createLogger } from "../output/log/logger.js";
import type { AnyVoid } from "../util/function.js";
import { isFunction } from "../util/is.js";
import { parseArgs } from "./arg.js";

export class Context extends AbortController {
  log = createLogger({ name: "context" });

  args = parseArgs({
    args: {
      "--help": Boolean,
      "-h": "--help",
      "--verbose": arg.COUNT,
      "-v": "--verbose",
      "--json": Boolean,

      // deprecated
      "--debug": "--verbose",
    },
    options: {
      argv: process.argv.slice(2),
      permissive: true,
      stopAtPositional: false,
    },
  });

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
