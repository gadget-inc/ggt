import ms from "ms";
import { timeoutMs } from "./timeout.js";

export const sleep = (duration: string): Promise<void> => {
  const milliseconds = ms(duration);
  return new Promise((resolve) => (milliseconds === 0 ? setImmediate(resolve) : setTimeout(resolve, milliseconds)));
};

export const sleepUntil = async (fn: () => boolean, { interval = "100ms", timeout = timeoutMs("5s") } = {}): Promise<void> => {
  const start = isFinite(timeout) && Date.now();

  // eslint-disable-next-line no-constant-condition, @typescript-eslint/no-unnecessary-condition
  while (true) {
    if (fn()) {
      return;
    }

    await sleep(interval);

    if (start && Date.now() - start > timeout) {
      const error = new Error(`Timed out after ${timeout} milliseconds`);
      Error.captureStackTrace(error, sleepUntil);
      throw error;
    }
  }
};
