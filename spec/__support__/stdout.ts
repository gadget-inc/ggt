import { afterEach, beforeEach, expect, vi, type Assertion } from "vitest";

export const testStdout: string[] = [];

export const expectStdout = (): Assertion<string> => expect(testStdout.join(""));

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

export const testStderr: string[] = [];

export const expectStderr = (): Assertion<string> => expect(testStderr.join(""));

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