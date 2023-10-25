import chalkTemplate from "chalk-template";
import levenshtein from "fast-levenshtein";
import { isObject, isString, sortBy } from "lodash";
import assert from "node:assert";
import process from "node:process";
import { dedent } from "ts-dedent";

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

export const sprint = (template: TemplateStringsArray | string, ...values: unknown[]) => {
  const content = isString(template) ? template : chalkTemplate(template, ...values);
  return dedent(content);
};

export const sprintln = (template: TemplateStringsArray | string, ...values: unknown[]) => {
  return sprint(template, ...values) + "\n";
};

export const sprintln2 = (template: TemplateStringsArray | string, ...values: unknown[]) => {
  return sprint(template, ...values) + "\n\n";
};

export const print = (template: TemplateStringsArray | string, ...values: unknown[]) => {
  stdout.write(sprint(template, ...values));
};

export const println = (template?: TemplateStringsArray | string, ...values: unknown[]) => {
  if (template) {
    stdout.write(sprint(template, ...values));
  }
  stdout.write("\n");
};

export const println2 = (template?: TemplateStringsArray | string, ...values: unknown[]) => {
  if (template) {
    stdout.write(sprint(template, ...values));
  }
  stdout.write("\n\n");
};

export const sortByLevenshtein = (input: string, options: readonly string[]): [closest: string, ...sorted: string[]] => {
  assert(options.length > 0, "options must not be empty");
  return sortBy(options, (opt) => levenshtein.get(opt, input)) as [string, ...string[]];
};
