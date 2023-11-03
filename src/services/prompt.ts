import inqConfirm from "@inquirer/confirm";
import inqSelect from "@inquirer/select";
import { z } from "zod";
import { mapRecords } from "./collections.js";
import { println } from "./print.js";

export const select = async <T extends string>({ message, choices }: { message: string; choices: T[] }): Promise<T> => {
  println("");

  try {
    return await inqSelect({ message, choices: mapRecords(choices, "value") });
  } catch (error) {
    swallowCtrlC(error);
    process.exit(0);
  }
};

export const confirm = async ({ message }: { message: string }): Promise<void> => {
  println("");

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
