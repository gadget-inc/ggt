import { afterEach, beforeEach, expect, type Assertion } from "vitest";

import { mock, mockRestore } from "./mock.js";

const testStdout: string[] = [];

/**
 * Returns an assertion that checks the contents of stdout.
 *
 * @example
 * expectStdout().toEqual("Hello World!");
 * @example
 * expectStdout().toMatchInlineSnapshot();
 */
export const expectStdout = (): Assertion<string> => expect(testStdout.join(""));

/**
 * Mocks stdout and resets its contents before each test.
 *
 * This is called before each test by default.
 */
export const mockStdout = (): void => {
  beforeEach(async () => {
    testStdout.length = 0;

    const { output } = await import("../../src/services/output/output.js");

    // reset the state of the output service
    output.lastPrintedLineWasEmpty = true;
    output.lastStickyLineWasEmpty = true;

    // @ts-expect-error - _writeStdout is private
    mock(output, "_writeStdout", (data) => {
      testStdout.push(data);
      return true;
    });
  });
};

const testStderr: string[] = [];

/**
 * Returns an assertion that checks the contents of stderr.
 *
 * @example
 * expectStderr().toEqual("Hello World!");
 * @example
 * expectStderr().toMatchInlineSnapshot();
 */
export const expectStderr = (): Assertion<string> => expect(testStderr.join(""));

/**
 * Mocks stderr and resets its contents before each test.
 */
export const mockStderr = (): void => {
  beforeEach(async () => {
    const { output } = await import("../../src/services/output/output.js");
    // @ts-expect-error - _writeStderr is private
    mock(output, "_writeStderr", (data) => {
      testStderr.push(data);
      return true;
    });
    testStderr.length = 0;
  });

  afterEach(async () => {
    const { output } = await import("../../src/services/output/output.js");
    // @ts-expect-error - _writeStdout is private
    mockRestore(output._writeStdout);
  });
};
