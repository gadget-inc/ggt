import enquirer from "enquirer";
import { println } from "./print.js";

interface Prompt {
  message: string;
}

interface SelectPrompt<T extends string> extends Prompt {
  choices: T[];
}

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

export const confirm = async (prompt: Prompt): Promise<boolean> => {
  println("");

  const { result } = await enquirer.prompt<{ result: boolean }>({
    type: "confirm",
    name: "result",
    onCancel: () => process.exit(0),
    message: prompt.message,
  });

  return result;
};
