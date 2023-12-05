import ms from "ms";
import inspector from "node:inspector";
import process from "node:process";
import { parseBoolean } from "../../src/services/util/boolean.js";

/**
 * Suspends the execution of the current async function for the given
 * duration.
 *
 * @param duration - The duration string, e.g. '1s', '500ms', '10m'.
 * @returns A promise that resolves after the specified duration has
 * elapsed.
 */
export const sleep = (duration: string): Promise<void> => {
  const milliseconds = ms(duration);
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

/**
 * Returns the timeout duration in milliseconds.
 * If running in an inspector, returns Infinity.
 * If running in a CI environment, returns the duration multiplied by 2.
 *
 * @param duration - The duration string, e.g. '1s', '500ms', '10m'.
 * @returns The timeout duration in milliseconds.
 */
export const timeoutMs = (duration: string): number => {
  if (inspector.url() !== undefined) {
    return Infinity;
  }

  const milliseconds = ms(duration);

  if (parseBoolean(process.env["CI"])) {
    return milliseconds * 2;
  }

  return milliseconds;
};
