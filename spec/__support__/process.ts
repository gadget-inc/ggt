import { expect, vi } from "vitest";

export const expectProcessExit = async (fnThatExits: () => unknown, expectedCode = 0): Promise<void> => {
  const exitError = new Error("process.exit() was called") as Error & { code?: number };
  vi.spyOn(process, "exit").mockImplementationOnce((exitCode) => {
    exitError.code = exitCode;
    throw exitError;
  });

  try {
    await fnThatExits();
    expect.fail("Expected process.exit() to be called");
  } catch (error) {
    expect(error).toBe(exitError);
    expect(exitError.code).toBe(expectedCode);
  }
};
