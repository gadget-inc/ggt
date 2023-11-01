import prompts from "prompts";
import { println } from "./print.js";

export const select = async <T extends string>({ message, choices }: { message: string; choices: T[] }): Promise<T> => {
  const response = await prompts({
    type: "select",
    name: "result",
    message,
    choices: choices.map((choice) => ({ title: choice, value: choice })),
  });

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
