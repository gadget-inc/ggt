export function sleep(ms = 0): Promise<void> {
  return new Promise((resolve) => (ms == 0 ? setImmediate(resolve) : setTimeout(resolve, ms)));
}

export async function sleepUntil(fn: () => boolean, { interval = 0, timeout = process.env["CI"] ? 2500 : 500 } = {}): Promise<void> {
  const start = isFinite(timeout) && Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (fn()) return;
    await sleep(interval);

    if (start && Date.now() - start > timeout) {
      const error = new Error(`Timed out after ${timeout} milliseconds`);
      Error.captureStackTrace(error, sleepUntil);
      throw error;
    }
  }
}
