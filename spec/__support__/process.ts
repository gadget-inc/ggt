import { expect } from "vitest";

import { mock } from "./mock.js";

/**
 * Expects a process to exit with a specific code when the given
 * function is called.
 *
 * @param fnThatExits - The function that is expected to call `process.exit()`.
 * @param expectedCode - The expected exit code (default: 0).
 * @returns A promise that resolves when the expectation is met.
 */
export const expectProcessExit = async (fnThatExits: () => unknown, expectedCode = 0): Promise<void> => {
  const exitError = new Error("process.exit() was called");
  mock(process, "exit", () => {
    throw exitError;
  });

  try {
    await fnThatExits();
    expect.fail("Expected process.exit() to be called");
  } catch (error) {
    expect(error).toBe(exitError);
    expect(process.exit).toHaveBeenCalledWith(expectedCode);
  }
};
