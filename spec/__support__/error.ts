import { expect } from "vitest";
import { spyOnImplementing } from "vitest-mock-process";
import * as render from "../../src/services/error/report.js";
import { PromiseSignal } from "../../src/services/util/promise.js";

export const expectError = async (fnThatThrows: () => unknown): Promise<any> => {
  try {
    await fnThatThrows();
    expect.fail("Expected error to be thrown");
  } catch (error) {
    return error;
  }
};

export const expectReportErrorAndExit = async (expectedCause: unknown): Promise<void> => {
  const signal = new PromiseSignal();

  spyOnImplementing(render, "reportErrorAndExit", (actualCause) => {
    expect(actualCause).toBe(expectedCause);
    signal.resolve();
    return Promise.resolve() as never;
  });

  await signal;
};
