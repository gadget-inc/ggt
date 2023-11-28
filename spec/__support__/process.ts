import { expect } from "vitest";
import { mockProcessExit } from "vitest-mock-process";

export const expectProcessExit = async (fnThatExits: () => unknown, expectedCode = 0): Promise<void> => {
  const exitError = new Error("process.exit() was called");
  mockProcessExit(exitError);

  try {
    await fnThatExits();
    expect.fail("Expected process.exit() to be called");
  } catch (error) {
    expect(error).toBe(exitError);
    expect(process.exit).toHaveBeenCalledWith(expectedCode);
  }
};
