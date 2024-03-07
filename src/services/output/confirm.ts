import chalk from "chalk";
import process from "node:process";
import type { Promisable } from "type-fest";
import { isString } from "../util/is.js";
import { defaults } from "../util/object.js";
import { output } from "./output.js";
import { println } from "./print.js";
import { Prompt, type StdinKey } from "./prompt.js";
import { isSprintOptions, sprint, sprintln, type SprintOptions } from "./sprint.js";

export type ConfirmOptions = SprintOptions & {
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

export type confirm = {
  (str: string): Promise<void>;
  (template: TemplateStringsArray, ...values: unknown[]): Promise<void>;
  (options: ConfirmOptions): confirm;
};

// TODO: i regret this api... don't make it the same as println... just make it take ctx and options
const createConfirm = (options: ConfirmOptions): confirm => {
  options = defaults(options, {
    ensureEmptyLineAbove: true,
    exitWhenNo: true,
  });

  return ((templateOrOptions: ConfirmOptions | string | TemplateStringsArray, ...values: unknown[]): confirm | Promise<void> => {
    if (isSprintOptions(templateOrOptions)) {
      return createConfirm({ ...options, ...templateOrOptions });
    }

    let text = templateOrOptions as string;
    if (!isString(text)) {
      text = sprint(templateOrOptions as TemplateStringsArray, ...values);
    }

    const whenNotInteractive =
      options.whenNotInteractive ??
      (() => {
        // TODO: log an error here
        println(options)(text);
        println({ ensureEmptyLineAbove: true })`
          Aborting because ggt is not running in an interactive terminal.
        `;
        process.exit(1);
      });

    if (!output.isInteractive) {
      return Promise.resolve(whenNotInteractive());
    }

    return new Promise((resolve) => {
      const conf = new Confirm(text, options);
      conf.on("submit", resolve);
      conf.on("exit", () => process.exit(0));
      conf.on("abort", () => process.exit(1));
    });
  }) as confirm;
};

export const confirm = createConfirm({});

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

  constructor(
    readonly text: string,
    options: Partial<ConfirmOptions>,
  ) {
    super();

    this.options = defaults(options, {
      exitWhenNo: true,
      ensureEmptyLineAbove: true,
    });

    if (this.options.ensureEmptyLineAbove) {
      this.text = "\n" + this.text;
    }

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
      output.persistPrompt(sprintln`
        ${this.text} ${value ? chalk.bold.greenBright("Yes.") : chalk.bold.redBright("No.")}
      `);
      return;
    }

    output.updatePrompt(sprintln`
      ${this.text} ${this.defaultValue ? "[Y/n] " : "[y/N] "}
    `);
  }
}
