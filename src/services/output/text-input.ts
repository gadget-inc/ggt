import chalk from "chalk";
import process from "node:process";
import readline from "node:readline";

import { output } from "./output.js";
import { println } from "./print.js";
import { sprintln } from "./sprint.js";

export type TextInputOptions = {
  content: string;
  validate?: (value: string) => string | undefined;
};

export type textInput = typeof textInput;

export const textInput = async (options: TextInputOptions): Promise<string> => {
  if (!output.isInteractive) {
    println(options.content);
    println({ ensureEmptyLineAbove: true, content: "Aborting because ggt is not running in an interactive terminal." });
    process.exit(1);
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });

    const ask = (): void => {
      rl.question(sprintln({ ensureEmptyLineAbove: true, content: `${options.content} ` }), (answer) => {
        const trimmed = answer.trim();

        if (options.validate) {
          const error = options.validate(trimmed);
          if (error) {
            output.writeStdout(sprintln({ content: chalk.red(error) }));
            ask();
            return;
          }
        }

        rl.close();
        resolve(trimmed);
      });
    };

    ask();
  });
};
