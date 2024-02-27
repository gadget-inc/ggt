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

    const { stdout } = await import("../../src/services/output/output.js");
    mock(stdout, "_write", (data) => {
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
    const { stderr: stderr } = await import("../../src/services/output/output.js");
    mock(stderr, "write", (data) => {
      testStderr.push(data);
      return true;
    });
    testStderr.length = 0;
  });

  afterEach(async () => {
    const { stderr: stderr } = await import("../../src/services/output/output.js");
    mockRestore(stderr.write);
  });
};
