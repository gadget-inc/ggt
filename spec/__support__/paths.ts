import { workspacePath } from "../../src/services/config/paths.js";
import { getCurrentTest } from "./debug.js";

/**
 * Returns the path to a test directory within tmp/spec/ based on the
 * current test name and optional segments.
 *
 * @param segments - path segments to append to the test directory path.
 * @returns The path to the test directory.
 * @example
 * // file: spec/some/test.spec.ts
 * testDirPath("foo/bar", "baz.txt"); // => tmp/spec/some/test.spec.ts/foo/bar/baz.txt
 */
export const testDirPath = (...segments: string[]): string => {
  const test = getCurrentTest();
  return workspacePath("tmp/", test.filepath, test.describes.join("/"), test.name.replace(/[^\s\w-]/g, ""), ...segments);
};

const fixturesDirPath = (...segments: string[]): string => {
  return workspacePath("spec/__fixtures__", ...segments);
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
