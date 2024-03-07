import chalk from "chalk";
import dayjs from "dayjs";

export const ts = (): string => {
  // TODO: we should probably do this, but it breaks ggt's tests in CI
  // if (parseBoolean(process.env["CI"])) {
  //   return new Date().toISOString();
  // }
  return chalk.gray(dayjs().format("hh:mm:ss A"));
};
