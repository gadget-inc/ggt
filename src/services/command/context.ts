import { isAbortError } from "../util/is.js";
import type { RootArgs } from "./command.js";

export class Context extends AbortController {
  constructor(public readonly rootArgs: RootArgs) {
    super();
  }

  public wasCanceled(): boolean {
    return isAbortError(this.signal.reason);
  }
}
