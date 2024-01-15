import cleanStack from "clean-stack";
import assert from "node:assert";
import { expect } from "vitest";
import { createLogger } from "../../src/services/output/log/logger.js";
import { workspaceRoot } from "../../src/services/util/paths.js";
import { mockRestore } from "./mock.js";

/**
 * A logger just for tests.
 */
export const log = createLogger({ name: "test" });

/**
 * @returns The current test name, describes, and filepath.
 */
export const getCurrentTest = (): { name: string; describes: string[]; filepath: string } => {
  const currentTestName = expect.getState().currentTestName;
  assert(currentTestName, "expected currentTestName to be defined");

  const [filepath, ...rest] = currentTestName.split(" > ");
  const describes = rest.length > 1 ? rest.slice(0, -1) : [];
  const name = rest.at(-1)?.replace(/[^\s\w+-]/g, "");
  assert(filepath && name, "expected test file and test name to be defined");

  return { name, describes, filepath };
};

/**
 * Prints the current stack trace and fails the test.
 *
 * @param message - The error message.
 */
// eslint-disable-next-line func-style
export function printStackTraceAndFail(message: string): never {
  const carrier = { stack: "" };
  Error.captureStackTrace(carrier, printStackTraceAndFail);
  const stack = cleanStack(carrier.stack, { pretty: true, basePath: workspaceRoot })
    // remove the first line, which is the error message
    .slice(carrier.stack.indexOf("\n"));

  process.stderr.write(message + stack + "\n");
  mockRestore(process.exit);
  process.exit(1);
}

/**
 * Asserts that the given expression is truthy, otherwise prints the
 * stack trace and fails the test.
 */
// eslint-disable-next-line func-style
export function assertOrFail(expression: unknown, message: string): asserts expression {
  if (!expression) {
    printStackTraceAndFail(message);
  }
}
