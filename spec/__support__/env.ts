/**
 * Sets the given environment variables for the duration of the given function.
 */
export const withEnv = <T>(env: Record<string, string | undefined>, fn: () => T): T => {
  const keys = Object.keys(env);
  const original = keys.map((key) => [key, process.env[key]] as const);
  for (const key of keys) {
    process.env[key] = env[key];
  }

  const cleanup = (): void => {
    for (const [key, value] of original) {
      process.env[key] = value;
    }
  };

  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(cleanup) as T;
    }

    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
};
