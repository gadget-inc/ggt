import prompts from "prompts";
import { isNil } from "./is.js";
import { println } from "./print.js";

export const select = async <T extends string>({ message, choices }: { message: string; choices: T[] }): Promise<T> => {
  println("");

  const response = await prompts({
    type: "select",
    name: "result",
    message,
    choices: choices.map((choice) => ({ title: choice, value: choice })),
  });

  if (isNil(response.result)) {
    // they pressed ctrl+c
    process.exit(0);
  }

  return response.result as T;
};

export const confirm = async ({ message }: { message: string }): Promise<void> => {
  println("");

  const response = await prompts({
    type: "confirm",
    name: "result",
    message,
  });

  if (!response.result) {
    process.exit(0);
  }
};
