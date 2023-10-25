import { timeoutMs } from "./timeout.js";

export const sleep = (ms = 0): Promise<void> => {
  return new Promise((resolve) => (ms === 0 ? setImmediate(resolve) : setTimeout(resolve, ms)));
};

export const sleepUntil = async (fn: () => boolean, { interval = 0, timeout = timeoutMs("5s") } = {}): Promise<void> => {
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
