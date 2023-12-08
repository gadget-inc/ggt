import prompts from "prompts";
import { createLogger } from "./log/logger.js";

const log = createLogger({ name: "prompt" });

/**
 * Prompts the user to select an option from a list of choices.
 *
 * @param message - The message to display to the user.
 * @param choices - The list of choices for the user to select from.
 * @returns A promise that resolves to the selected option.
 */
export const select = async <T extends string>({ message, choices }: { message: string; choices: T[] }): Promise<T> => {
  log.println("");

  try {
    const response = await prompts({
      name: "value",
      type: "autocomplete",
      message,
      choices: choices.map((value) => ({ title: value, value })),
    });

    if (!response.value) {
      // The user pressed Ctrl+C
      process.exit(0);
    }

    return response.value as T;
  } catch (error) {
    process.exit(0);
  }
};

/**
 * Displays a confirmation prompt with the specified message. If the
 * user confirms, the function resolves, otherwise it exits the process.
 *
 * @param message - The message to display in the confirmation prompt.
 * @returns A Promise that resolves when the user confirms the prompt.
 */
export const confirm = async ({ message }: { message: string }): Promise<void> => {
  log.println("");

  const response = await prompts({
    name: "value",
    type: "confirm",
    message,
  });

  if (!response.value) {
    // The user pressed Ctrl+C
    process.exit(0);
  }
};
