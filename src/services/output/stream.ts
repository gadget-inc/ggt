import process from "node:process";
import { isObject } from "../util/is.js";

/**
 * A wrapper around process.stdout and process.stderr that allows us to mock out the streams for testing.
 *
 * @see https://github.com/oclif/core/blob/16139fe8a7f991b4b446a1599ab63f15d9809b8e/src/cli-ux/stream.ts
 */
export class Stream {
  public constructor(public channel: "stdout" | "stderr") {
    process[this.channel].on("error", (err: unknown) => {
      if (isObject(err) && "code" in err && err.code === "EPIPE") {
        return;
      }
      throw err;
    });
  }

  public get isTTY(): boolean {
    return process[this.channel].isTTY;
  }

  public getWindowSize(): number[] {
    return process[this.channel].getWindowSize();
  }

  public write(data: string): boolean {
    return process[this.channel].write(data);
  }

  public on(event: string, listener: (...args: unknown[]) => void): this {
    process[this.channel].on(event, listener);
    return this;
  }

  public once(event: string, listener: (...args: unknown[]) => void): this {
    process[this.channel].once(event, listener);
    return this;
  }
}

export const stdout = new Stream("stdout");
export const stderr = new Stream("stderr");