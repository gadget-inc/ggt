import chalk from "chalk";
import indentString from "indent-string";
import assert from "node:assert";
import process from "node:process";
import { isString } from "../util/is.js";
import { defaults } from "../util/object.js";
import { stderr } from "./output.js";
import { sprint, sprintln, type SprintOptions } from "./print.js";
import { entriesToDisplay, Prompt, type StdinKey } from "./prompt.js";

export type SelectOptions<Choice extends string> = SprintOptions & {
  choices: Choice[];
  formatChoice?: (choice: Choice) => string;
  formatSelection?: (choice: Choice) => string;
};
class Select<Choice extends string> extends Prompt {
  cursor = 0;
  optionsPerPage = 10;
  options;

  constructor(
    readonly text: string,
    options: SelectOptions<Choice>,
  ) {
    super();

    this.options = defaults(options, {
      formatChoice: (choice) => choice,
      formatSelection: (choice) => choice,
      ...options,
    });

    if (this.options.ensureEmptyLineAbove) {
      this.text = "\n" + this.text;
    }

    this.render();
  }

  get selection(): Choice {
    const choice = this.options.choices[this.cursor];
    assert(choice, `choices[${this.cursor}] is not defined`);
    return choice;
  }

  moveCursor(n: number): void {
    this.cursor = n;
    this.fire();
  }

  reset(): void {
    this.moveCursor(0);
    this.fire();
    this.render();
  }

  exit(): void {
    this.abort();
  }

  abort(): void {
    this.done = this.aborted = true;
    this.fire();
    this.render("Ctrl+C" as Choice);
    this.close();
  }

  submit(): void {
    this.done = true;
    this.aborted = false;
    this.value = this.selection;
    this.fire();
    this.render();
    this.close();
  }

  first(): void {
    this.moveCursor(0);
    this.render();
  }

  last(): void {
    this.moveCursor(this.options.choices.length - 1);
    this.render();
  }

  up(): void {
    if (this.cursor === 0) {
      this.moveCursor(this.options.choices.length - 1);
    } else {
      this.moveCursor(this.cursor - 1);
    }
    this.render();
  }

  down(): void {
    if (this.cursor === this.options.choices.length - 1) {
      this.moveCursor(0);
    } else {
      this.moveCursor(this.cursor + 1);
    }
    this.render();
  }

  next(): void {
    this.moveCursor((this.cursor + 1) % this.options.choices.length);
    this.render();
  }

  override _(char: string, _key: StdinKey): void {
    if (char === " ") {
      this.submit();
      return;
    }
  }

  override render(selection?: Choice): void {
    if (this.closed) {
      return;
    }

    super.render();

    let question = this.text;
    if (this.done) {
      stderr.persistPrompt(sprintln`
        ${question.trimEnd()} ${this.options.formatSelection(selection ?? this.selection)}
      `);
      return;
    }

    question += ` ${chalk.gray("(Use arrow keys)")}\n\n`;

    let choices = "";
    const { startIndex, endIndex } = entriesToDisplay(this.cursor, this.options.choices.length, this.optionsPerPage);
    for (let index = startIndex; index < endIndex; index++) {
      // determine whether to display "more choices" indicators
      let prefix: string;
      if (this.cursor === index) {
        prefix = "→ ";
      } else if (index === startIndex && startIndex > 0) {
        prefix = "↑ ";
      } else if (index === endIndex - 1 && endIndex < this.options.choices.length) {
        prefix = "↓ ";
      } else {
        prefix = "  ";
      }

      const choice_ = this.options.choices[index];
      assert(choice_, `choices[${index}] is not defined`);

      let choice = this.options.formatChoice(choice_);
      if (this.cursor === index) {
        choice = chalk.blue.underline(choice);
      }

      choices += `${prefix}${choice}\n`;
    }

    if (this.options.indent) {
      choices = indentString(choices, this.options.indent);
    }

    stderr.updatePrompt(question + choices);
  }
}

export type select<Choice extends string> = (options: SelectOptions<Choice>) => selectWithChoices<Choice>;

export type selectWithChoices<Choice extends string> = {
  (str: string): Promise<Choice>;
  (template: TemplateStringsArray, ...values: unknown[]): Promise<Choice>;
};

export const select = <Choice extends string>(options: SelectOptions<Choice>): selectWithChoices<Choice> => {
  return ((template: string | TemplateStringsArray, ...values: unknown[]): Promise<Choice> => {
    let text = template as string;
    if (!isString(text)) {
      text = sprint(template as TemplateStringsArray, ...values);
    }

    return new Promise((resolve) => {
      const sel = new Select(text, {
        formatChoice: (choice) => choice,
        formatSelection: (choice) => choice,
        ...options,
      });
      sel.on("submit", resolve);
      sel.on("exit", () => process.exit(0));
      sel.on("abort", () => process.exit(0));
    });
  }) as selectWithChoices<Choice>;
};
