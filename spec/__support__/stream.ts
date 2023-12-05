import { afterEach, beforeEach, expect, vi, type Assertion } from "vitest";

const testStdout: string[] = [];

/**
 * Returns an assertion that checks the contents of stdout.
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
    const { stdout } = await import("../../src/services/output/stream.js");
    vi.spyOn(stdout, "write").mockImplementation((data) => {
      testStdout.push(data);
      return true;
    });
    testStdout.length = 0;
  });

  afterEach(async () => {
    const { stdout } = await import("../../src/services/output/stream.js");
    stdout.write.mockRestore();
  });
};

const testStderr: string[] = [];

/**
 * Returns an assertion that checks the contents of stderr.
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
    const { stderr } = await import("../../src/services/output/stream.js");
    vi.spyOn(stderr, "write").mockImplementation((data) => {
      testStderr.push(data);
      return true;
    });
    testStderr.length = 0;
  });

  afterEach(async () => {
    const { stderr } = await import("../../src/services/output/stream.js");
    stderr.write.mockRestore();
  });
};
