import { expect } from "vitest";
import { spyOnImplementing } from "vitest-mock-process";
import * as report from "../../src/services/output/report.js";
import { PromiseSignal } from "../../src/services/util/promise.js";

/**
 * Executes a function that is expected to throw an error and returns
 * the thrown error. If the function does not throw an error, the test
 * fails.
 *
 * @param fnThatThrows - The function that is expected to throw an error.
 * @returns A Promise that resolves to the thrown error.
 */
export const expectError = async (fnThatThrows: () => unknown): Promise<any> => {
  try {
    await fnThatThrows();
    expect.fail("Expected error to be thrown");
  } catch (error) {
    return error;
  }
};

/**
 * Expects {@linkcode report.reportErrorAndExit reportErrorAndExit} to
 * be called with the given cause.
 *
 * @param expectedCause - The expected cause of the error.
 * @returns A promise that resolves when the error is reported.
 */
export const expectReportErrorAndExit = async (expectedCause: unknown): Promise<void> => {
  const signal = new PromiseSignal();

  spyOnImplementing(report, "reportErrorAndExit", (actualCause) => {
    expect(actualCause).toBe(expectedCause);
    signal.resolve();
    return Promise.resolve() as never;
  });

  await signal;
};
