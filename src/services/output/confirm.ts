import chalk from "chalk";
import process from "node:process";
import type { Promisable } from "type-fest";
import { defaults } from "../util/object.js";
import type { PartialExcept } from "../util/types.js";
import { output } from "./output.js";
import { println, type PrintOptions } from "./print.js";
import { Prompt, type StdinKey } from "./prompt.js";
import { sprintln } from "./sprint.js";

export type ConfirmOptions = PrintOptions & {
  /**
   * If `true`, ggt will exit if the user selects "No".
   *
   * @default true
   */
  exitWhenNo?: boolean;

  /**
   * What to do if ggt is not running in an interactive terminal.
   *
   * @default ```
   * println(options)(text);
   * println({ ensureEmptyLineAbove: true })`
   *   Aborting because ggt is not running in an interactive terminal.
   * `;
   * process.exit(1);
   * ```
   */
  whenNotInteractive?: () => Promisable<void>;
};

export type confirm = typeof confirm;

export const confirm = (contentOrOptions: string | ConfirmOptions): Promise<void> => {
  let options: ConfirmOptions;
  if (typeof contentOrOptions === "string") {
    options = { content: contentOrOptions };
  } else {
    options = contentOrOptions;
  }

  options = defaults(options, {
    ensureEmptyLineAbove: true,
    ensureNewLine: true,
    exitWhenNo: true,
  });

  if (!output.isInteractive) {
    const whenNotInteractive =
      options.whenNotInteractive ??
      (() => {
        println(options);
        println({ ensureEmptyLineAbove: true, content: "Aborting because ggt is not running in an interactive terminal." });
        process.exit(1);
      });

    return Promise.resolve(whenNotInteractive());
  }

  return new Promise((resolve) => {
    const conf = new Confirm(options);
    conf.on("submit", resolve);
    conf.on("exit", () => process.exit(0));
    conf.on("abort", () => process.exit(1));
  });
};

/**
 * Inspired by `prompts`:
 * https://github.com/terkelg/prompts/blob/e0519913ec4fcc6746bb3d97d8cd0960c3f3ffde/lib/elements/confirm.js
 *
 * MIT License
 *
 * Copyright (c) 2018 Terkel Gjervig Nielsen
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
export class Confirm extends Prompt {
  override value: boolean | undefined = undefined;
  defaultValue = false;
  options;

  constructor(options: PartialExcept<ConfirmOptions, "content">) {
    super();

    this.options = defaults(options, {
      exitWhenNo: true,
      ensureEmptyLineAbove: true,
    });

    this.render();
  }

  reset(): void {
    this.value = this.defaultValue;
    this.fire();
    this.render();
  }

  exit(): void {
    this.abort();
  }

  abort(): void {
    this.value = false;
    this.done = this.aborted = true;
    this.fire();
    this.render(false);
    this.close();

    if (this.options.exitWhenNo) {
      process.exit(0);
    }
  }

  submit(): void {
    this.value = this.value ?? false;
    this.done = true;
    this.aborted = false;
    this.fire();
    this.render();
    this.close();

    if (this.options.exitWhenNo && !this.value) {
      process.exit(0);
    }
  }

  override _(char: string, _key: StdinKey): void {
    if (char.toLowerCase() === "y") {
      this.value = true;
      this.submit();
      return;
    }

    if (char.toLowerCase() === "n") {
      this.value = false;
      this.submit();
      return;
    }

    this.bell();
  }

  override render(value = this.value): void {
    super.render();

    if (this.done) {
      output.persistPrompt(
        sprintln({
          ...this.options,
          content: `${this.options.content} ${value ? chalk.bold.greenBright("Yes.") : chalk.bold.redBright("No.")}`,
        }),
      );
      return;
    }

    output.updatePrompt(
      sprintln({
        ...this.options,
        content: `${this.options.content} ${this.defaultValue ? chalk.blueBright("[Y/n] ") : chalk.blueBright("[y/N] ")}`,
      }),
    );
  }
}
