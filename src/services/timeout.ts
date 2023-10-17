import ms from "ms";
import process from "node:process";

export const timeoutMs = (duration: string) => {
  const milliseconds = ms(duration);
  return process.env["CI"] ? milliseconds * 2 : milliseconds;
};
