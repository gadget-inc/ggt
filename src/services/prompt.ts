import chalk from "chalk";
import enquirer from "enquirer";
import assert from "node:assert";
import { z } from "zod";
import { createLogger } from "./log.js";
import { println } from "./print.js";

const log = createLogger("prompt");

type Prompt = {
  message: string;
};

type SelectPrompt<T extends string> = {
  choices: T[];
} & Prompt;

export const select = async <T extends string>(prompt: SelectPrompt<T>): Promise<T> => {
  const { result } = await enquirer.prompt<{ result: T }>({
    type: "select",
    name: "result",
    onCancel: () => process.exit(0),
    choices: prompt.choices,
    message: prompt.message,
  });

  return result;
};

export const confirm = async (prompt: Prompt): Promise<true> => {
  println("");

  const { result } = await enquirer.prompt<{ result: true }>({
    message: prompt.message,
    type: "confirm",
    name: "result",
    onCancel: () => process.exit(0),
    onSubmit(_name, value) {
      const self = z
        .object({
          isTrue: z.function(),
          cancel: z.function(),
        })
        .parse(this);

      if (self.isTrue(value)) {
        return true;
      }

      self.cancel.call(this);
      assert(false, "cancel should exit the process");
    },
    format: function (value) {
      try {
        const self = z
          .object({
            isTrue: z.function(),
            state: z.object({ submitted: z.boolean() }),
          })
          .parse(this);

        return self.isTrue(value) ? chalk.greenBright("Yes") : chalk.redBright("No");
      } catch (error) {
        log.error("error formatting value", { error });
        return value;
      }
    },
  });

  return result;
};
