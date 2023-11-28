import cleanStack from "clean-stack";
import assert from "node:assert";
import { dedent } from "ts-dedent";
import { expect } from "vitest";
import { workspaceRoot } from "../../src/services/config/paths.js";
import type { Fields } from "../../src/services/output/log/field.js";
import { createLogger } from "../../src/services/output/log/logger.js";

export const log = createLogger({ name: "test" });

export const logStack = (msg: Lowercase<string>, fields?: Fields): void => {
  const carrier = { stack: "" };
  Error.captureStackTrace(carrier, logStack);
  const stack = dedent(cleanStack(carrier.stack, { pretty: true, basePath: workspaceRoot }).slice(6));
  log.error(msg, { ...fields, stack });
};

export const getCurrentTest = (): { name: string; describes: string[]; filepath: string } => {
  const currentTestName = expect.getState().currentTestName;
  assert(currentTestName, "expected currentTestName to be defined");

  const [filepath, ...rest] = currentTestName.split(" > ");
  const describes = rest.length > 1 ? rest.slice(0, -1) : [];
  const name = rest.at(-1)?.replace(/[^\s\w-]/g, "");
  assert(filepath && name, "expected test file and test name to be defined");

  return { name, describes, filepath };
};