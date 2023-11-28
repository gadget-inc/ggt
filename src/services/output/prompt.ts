import inqConfirm from "@inquirer/confirm";
import inqSelect from "@inquirer/select";
import { z } from "zod";
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
    return await inqSelect({
      message,
      choices: choices.map((value) => ({ value })),
    });
  } catch (error) {
    swallowCtrlC(error);
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

  try {
    const yes = await inqConfirm({ message, default: false });
    if (!yes) {
      process.exit(0);
    }
  } catch (error) {
    swallowCtrlC(error);
    process.exit(0);
  }
};

const swallowCtrlC = (error: unknown): void => {
  z.object({ message: z.string().startsWith("User force closed") }).parse(error);
};
