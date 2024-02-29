import chalk from "chalk";
import dayjs from "dayjs";
import { parseBoolean } from "../util/boolean.js";

export const ts = (): string => {
  if (parseBoolean(process.env["CI"])) {
    return new Date().toISOString();
  }
  return chalk.gray(dayjs().format("hh:mm:ss A"));
};
