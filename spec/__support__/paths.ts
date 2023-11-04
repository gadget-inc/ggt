import path from "node:path";
import { assert, expect } from "vitest";

/**
 * Returns the path to a test directory within tmp/spec/ based on the
 * current test name and optional segments.
 *
 * @param segments - Optional path segments to append to the test
 * directory path.
 * @returns The path to the test directory.
 * @example
 * // file: spec/some/test.spec.ts
 * testDirPath("foo/bar", "baz.txt"); // => tmp/spec/some/test.spec.ts/foo/bar/baz.txt
 */
export const testDirPath = (...segments: string[]): string => {
  const currentTestName = expect.getState().currentTestName;
  assert(currentTestName, "expected currentTestName to be defined");

  const [testFile, ...rest] = currentTestName.split(" > ");
  const describes = rest.length > 1 ? rest.slice(0, -1).join("/") : "";
  const testName = rest.at(-1)?.replace(/[^\s\w-]/g, "");
  assert(testFile && testName, "expected test file and test name to be defined");

  return path.join(__dirname, "../../tmp/", testFile, describes, testName, ...segments);
};

const fixturesDirPath = (...segments: string[]): string => {
  return path.join(__dirname, "../__fixtures__", ...segments);
};

/**
 * Returns an absolute path to the `app` fixture directory.
 *
 * @param segments - Additional segments to append to the path.
 * @returns The path to the `app` fixture directory.
 */
export const appFixturePath = (...segments: string[]): string => {
  return fixturesDirPath("app", ...segments);
};
