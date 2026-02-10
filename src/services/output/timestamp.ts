import chalk from "chalk";
import dayjs from "dayjs";

import { env } from "../config/env.js";
import { parseBoolean } from "../util/boolean.js";

export const ts = (): string => {
  if (!env.testLike && parseBoolean(process.env["CI"])) {
    return new Date().toISOString();
  }
  return chalk.gray(dayjs().format("hh:mm:ss A"));
};
