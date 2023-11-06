import ansiColors from "ansi-colors";
import chalkTemplate from "chalk-template";
import CliTable3, { type TableConstructorOptions } from "cli-table3";
import levenshtein from "fast-levenshtein";
import assert from "node:assert";
import process from "node:process";
import stripAnsi from "strip-ansi";
import { dedent } from "ts-dedent";
import { config } from "./config.js";
import { isObject, isString } from "./is.js";
import { createLogger, type Logger } from "./log.js";

export const color = ansiColors;
export const symbol = ansiColors.symbols;

/**
 * A wrapper around process.stdout and process.stderr that allows us to mock out the streams for testing.
 *
 * @see https://github.com/oclif/core/blob/16139fe8a7f991b4b446a1599ab63f15d9809b8e/src/cli-ux/stream.ts
 */
export class Stream {
  private _log?: Logger;

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
    if (config.debug) {
      this._log ??= createLogger(this.channel);
      for (const line of stripAnsi(data).split("\n")) {
        this._log.debug(line as Lowercase<string>);
      }
      return true;
    } else {
      return process[this.channel].write(data);
    }
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

export const sprint = (template: TemplateStringsArray | string, ...values: unknown[]): string => {
  let content = template;
  if (!isString(content)) {
    content = chalkTemplate(content, ...values);
  }
  return dedent(content);
};

export const sprintln = (template: TemplateStringsArray | string, ...values: unknown[]): string => {
  return sprint(template, ...values) + "\n";
};

export const sprintlns = (template: TemplateStringsArray | string, ...values: unknown[]): string => {
  return "\n" + sprintln(template, ...values);
};

export const print = (template: TemplateStringsArray | string, ...values: unknown[]): void => {
  stdout.write(sprint(template, ...values));
};

export const println = (template: TemplateStringsArray | string, ...values: unknown[]): void => {
  stdout.write(sprintln(template, ...values));
};

export const printlns = (template: TemplateStringsArray | string, ...values: unknown[]): void => {
  stdout.write(sprintlns(template, ...values));
};

/**
 * EXAMPLE:
 *    "top-left": "╔",    top: "═",    "top-mid": "╤",    "top-right": "╗",
 *          left: "║",                    middle: "│",          right: "║",
 *    "left-mid": "╟",    mid: "─",    "mid-mid": "┼",    "right-mid": "╢",
 * "bottom-left": "╚", bottom: "═", "bottom-mid": "╧", "bottom-right": "╝",
 */
export const printTable = ({
  rows,
  ...options
}: TableConstructorOptions & {
  rows: string[][];
}): void => {
  const table = new CliTable3({
    ...options,
    style: { head: [], border: [], ...options.style },
    // prettier-ignore
    chars: {
      "top-left": "",    top: "",    "top-mid": "",    "top-right": "",
      "left-mid": "",    mid: "",    "mid-mid": "",    "right-mid": "",
            left: "",                   middle: "",          right: "",
   "bottom-left": "", bottom: "", "bottom-mid": "", "bottom-right": "",
      ...options.chars
  },
  });

  table.push(...rows);

  let output = table.toString();
  if (!options.head || options.head.length === 0) {
    // cli-table3 adds a single space to the first row when there are no
    // headers, so we remove it here
    output = output.slice(1);
  }

  println(output);
};

export const sortBySimilarity = (input: string, options: Iterable<string>): [closest: string, ...sorted: string[]] => {
  const strings = Array.from(options);
  assert(strings.length > 0, "options must not be empty");
  return strings.sort((a, b) => levenshtein.get(a, input) - levenshtein.get(b, input)) as [string, ...string[]];
};
