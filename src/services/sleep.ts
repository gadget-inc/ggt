export function sleep(ms = 0): Promise<void> {
  return new Promise((resolve) => (ms == 0 ? setImmediate(resolve) : setTimeout(resolve, ms)));
}

export async function sleepUntil(fn: () => boolean, { interval = 0, timeout = 5_000 } = {}): Promise<void> {
  if (process.env["CI"]) {
    // double the timeout in CI to account for slower machines
    timeout *= 2;
  }

  const start = isFinite(timeout) && Date.now();

  // eslint-disable-next-line no-constant-condition, @typescript-eslint/no-unnecessary-condition
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
