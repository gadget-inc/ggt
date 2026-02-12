import chalk from "chalk";
import indentString from "indent-string";
import assert from "node:assert";
import process from "node:process";

import type { XOR } from "../util/types.js";

import { defaults } from "../util/object.js";
import { output } from "./output.js";
import { println } from "./print.js";
import { entriesToDisplay, Prompt, type StdinKey } from "./prompt.js";
import { sprintln, type SprintOptionsWithContent } from "./sprint.js";
import { symbol } from "./symbols.js";

type BaseSelectOptions<Choice extends string> = SprintOptionsWithContent & {
  formatChoice?: (choice: Choice) => string;
  formatSelection?: (choice: Choice) => string;
  searchable?: boolean;
};

type FlatChoices<Choice extends string> = {
  choices: Choice[];
};

type GroupedChoices<Choice extends string> = {
  groupedChoices: [string, Choice[]][];
};

export type SelectOptions<Choice extends string> = BaseSelectOptions<Choice> & XOR<FlatChoices<Choice>, GroupedChoices<Choice>>;

export type select = typeof select;

export const select = <Choice extends string>(options: SelectOptions<Choice>): Promise<Choice> => {
  options = defaults(options, {
    ensureEmptyLineAbove: true,
  });

  if (!output.isInteractive) {
    println(options.content);
    println(JSON.stringify(options.choices ?? options.groupedChoices, undefined, 2));
    println({ ensureEmptyLineAbove: true, content: "Aborting because ggt is not running in an interactive terminal." });
    process.exit(1);
  }

  return new Promise((resolve) => {
    const sel = new Select({
      formatChoice: (choice) => choice,
      formatSelection: (choice) => choice,
      ...options,
    });
    sel.on("submit", resolve);
    sel.on("exit", () => process.exit(0));
    sel.on("abort", () => process.exit(0));
  });
};

/**
 * Inspired by `prompts`:
 * https://github.com/terkelg/prompts/blob/e0519913ec4fcc6746bb3d97d8cd0960c3f3ffde/lib/elements/select.js
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
class Select<Choice extends string> extends Prompt {
  cursor = 0;
  optionsPerPage = 10;
  options;
  currentChoices: Choice[];
  groupedChoicesTitleIndexMap = new Map<number, string>();

  // search state
  searchable: boolean;
  input = "";
  allChoices: Choice[];
  allGroupedChoices?: [string, Choice[]][];

  constructor(options: SelectOptions<Choice>) {
    super();

    this.options = defaults(options, {
      formatChoice: (choice) => choice,
      formatSelection: (choice) => choice,
      ...options,
    });

    this.searchable = this.options.searchable ?? false;

    if (this.options.choices) {
      this.currentChoices = this.options.choices;
      this.allChoices = [...this.options.choices];
    } else {
      this.currentChoices = this.options.groupedChoices.flatMap(([_, choices]) => choices);
      this.allChoices = [...this.currentChoices];
      this.allGroupedChoices = this.options.groupedChoices;
      this.rebuildGroupTitleIndexMap();
    }

    this.render();
  }

  private rebuildGroupTitleIndexMap(): void {
    this.groupedChoicesTitleIndexMap.clear();

    if (!this.allGroupedChoices) {
      return;
    }

    // build the map from the current filtered choices
    const query = this.input.toLowerCase();
    let currentIndex = 0;

    for (const [title, choices] of this.allGroupedChoices) {
      const filtered = query ? choices.filter((c) => c.toLowerCase().includes(query)) : choices;

      for (let i = 0; i < filtered.length; i++) {
        if (i === 0) {
          this.groupedChoicesTitleIndexMap.set(currentIndex, title);
        }
        currentIndex++;
      }
    }
  }

  private refilter(): void {
    const query = this.input.toLowerCase();

    if (this.allGroupedChoices) {
      if (query) {
        this.currentChoices = this.allGroupedChoices.flatMap(([_, choices]) =>
          choices.filter((c) => c.toLowerCase().includes(query)),
        ) as Choice[];
      } else {
        this.currentChoices = this.allGroupedChoices.flatMap(([_, choices]) => choices) as Choice[];
      }
      this.rebuildGroupTitleIndexMap();
    } else {
      if (query) {
        this.currentChoices = this.allChoices.filter((c) => c.toLowerCase().includes(query));
      } else {
        this.currentChoices = [...this.allChoices];
      }
    }

    this.cursor = 0;
    this.render();
  }

  get selection(): Choice {
    const choice = this.currentChoices[this.cursor];
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
    if (this.searchable && this.input.length > 0) {
      this.input = "";
      this.refilter();
      return;
    }
    this.bell();
  }

  abort(): void {
    this.done = this.aborted = true;
    this.fire();
    this.render("Cancel (Ctrl+C)" as Choice);
    this.close();
  }

  submit(): void {
    if (this.currentChoices.length === 0) {
      this.bell();
      return;
    }
    this.done = true;
    this.aborted = false;
    this.value = this.selection;
    this.fire();
    this.render();
    this.close();
  }

  delete(): void {
    if (!this.searchable || this.input.length === 0) {
      this.bell();
      return;
    }
    this.input = this.input.slice(0, -1);
    this.refilter();
  }

  first(): void {
    if (this.currentChoices.length === 0) {
      return;
    }
    this.moveCursor(0);
    this.render();
  }

  last(): void {
    if (this.currentChoices.length === 0) {
      return;
    }
    this.moveCursor(this.currentChoices.length - 1);
    this.render();
  }

  up(): void {
    if (this.currentChoices.length === 0) {
      return;
    }
    if (this.cursor === 0) {
      this.moveCursor(this.currentChoices.length - 1);
    } else {
      this.moveCursor(this.cursor - 1);
    }
    this.render();
  }

  down(): void {
    if (this.currentChoices.length === 0) {
      return;
    }
    if (this.cursor === this.currentChoices.length - 1) {
      this.moveCursor(0);
    } else {
      this.moveCursor(this.cursor + 1);
    }
    this.render();
  }

  next(): void {
    if (this.currentChoices.length === 0) {
      return;
    }
    this.moveCursor((this.cursor + 1) % this.currentChoices.length);
    this.render();
  }

  override _(char: string, _key: StdinKey): void {
    if (this.searchable && char) {
      if (char === " " && this.input.length === 0) {
        this.submit();
        return;
      }
      this.input += char;
      this.refilter();
      return;
    }

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

    let question = this.options.content;
    if (this.done) {
      output.persistPrompt(
        sprintln({
          ...this.options,
          content: `${question.trimEnd()} ${this.options.formatChoice(selection ?? this.selection)}`,
        }),
      );
      return;
    }

    if (this.searchable) {
      question += ` ${chalk.gray("Type to filter, arrow keys to move")}\n`;
      question += `${chalk.gray(">")} ${this.input}\n\n`;
    } else {
      question += ` ${chalk.gray("Use arrow keys to move")}\n\n`;
    }

    if (this.currentChoices.length === 0) {
      let noMatches = chalk.gray("No matches found") + "\n";
      if (this.options.indent) {
        noMatches = indentString(noMatches, this.options.indent);
      }
      output.updatePrompt(question + noMatches);
      return;
    }

    let choices = "";
    const { startIndex, endIndex } = entriesToDisplay(this.cursor, this.currentChoices.length, this.optionsPerPage);
    for (let index = startIndex; index < endIndex; index++) {
      // determine whether to display "more choices" indicators
      let prefix: string;
      if (this.cursor === index) {
        prefix = `${symbol.arrowRight} `;
      } else if (index === startIndex && startIndex > 0) {
        prefix = `${symbol.arrowUp} `;
      } else if (index === endIndex - 1 && endIndex < this.currentChoices.length) {
        prefix = `${symbol.arrowDown} `;
      } else {
        prefix = "  ";
      }

      const choice_ = this.currentChoices[index];
      assert(choice_, `choices[${index}] is not defined`);

      let choice = this.options.formatChoice(choice_);
      if (this.cursor === index) {
        choice = chalk.blue.underline(choice);
      }

      if (this.groupedChoicesTitleIndexMap.has(index)) {
        if (index !== startIndex) {
          choices += "\n";
        }

        choices += `${chalk.grey(this.groupedChoicesTitleIndexMap.get(index))}\n`;
      }
      choices += `${prefix}${choice}\n`;
    }

    if (this.options.indent) {
      choices = indentString(choices, this.options.indent);
    }

    output.updatePrompt(question + choices);
  }
}
