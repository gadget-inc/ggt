import chalk from "chalk";
import process from "node:process";
import { isArray, isString } from "../util/is.js";
import { defaults } from "../util/object.js";
import { stderr } from "./output.js";
import { sprint, sprintln, type SprintOptions } from "./print.js";
import { Prompt, type StdinKey } from "./prompt.js";

export type ConfirmOptions = SprintOptions & {
  /**
   * If `true`, ggt will exit if the user selects "No".
   *
   * @default true
   */
  exitWhenNo: boolean;
};

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
    this.render();
    this.close();
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

  override render(): void {
    super.render();

    if (this.done) {
      stderr.persistPrompt(sprintln`
        ${this.text} ${this.value ? chalk.bold.greenBright("Yes.") : chalk.bold.redBright("No.")}
      `);
      return;
    }

    stderr.updatePrompt(sprintln`
      ${this.text} ${this.defaultValue ? "[Y/n] " : "[y/N] "}
    `);
  }
}

export type confirm = {
  (str: string): Promise<void>;
  (template: TemplateStringsArray, ...values: unknown[]): Promise<void>;
  (options: SprintOptions): confirm;
};
const createConfirm = (options: SprintOptions): confirm => {
  return ((templateOrOptions: SprintOptions | string | TemplateStringsArray, ...values: unknown[]): confirm | Promise<void> => {
    if (!(isString(templateOrOptions) || isArray(templateOrOptions))) {
      return createConfirm({ ...options, ...templateOrOptions });
    }

    let text = templateOrOptions as string;
    if (!isString(text)) {
      text = sprint(templateOrOptions as TemplateStringsArray, ...values);
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
