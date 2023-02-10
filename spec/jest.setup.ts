process.env["GGT_ENV"] = "test";

import Debug from "debug";
import fs from "fs-extra";
import path from "path";
import chalk from "chalk";

// disable chalk so that we get predictable output in tests
chalk.level = 0;

// tests in CI take longer to run than in local development
jest.setTimeout(process.env["CI"] ? 10_000 : 1000);

const debug = Debug("ggt:test");

export function testDirPath(): string {
  return path.join(__dirname, "..", "tmp", "tests", expect.getState().currentTestName!.replace(/[ /,?=]/g, "-"));
}

beforeEach(async () => {
  process.env["GGT_ENV"] = "test";

  debug("starting test %o", { test: expect.getState().currentTestName, path: expect.getState().testPath });

  const testDir = testDirPath();
  await fs.remove(testDir);

  // store files in the test's tmp directory
  // https://github.com/oclif/core/blob/main/src/config/config.ts#L171
  process.env["GGT_CONFIG_DIR"] = path.join(testDir, "config");
  process.env["GGT_CACHE_DIR"] = path.join(testDir, "cache");
  process.env["GGT_DATA_DIR"] = path.join(testDir, "data");

  const { Config, Command } = await import("@oclif/core");
  const { context } = await import("../src/utils/context");
  context.clear();
  context.config = await Config.load(path.join(__dirname, ".."));

  jest.spyOn(Command.prototype, "log").mockImplementation();
  jest.spyOn(Command.prototype, "warn").mockImplementation();
  jest.spyOn(Command.prototype, "error").mockImplementation();

  // clear all mocks so that we can `expect(someFunction).not.toHaveBeenCalled()` in tests where someFunction was called in another test
  jest.clearAllMocks();
});

afterEach(() => {
  debug("ending test %o", { test: expect.getState().currentTestName, path: expect.getState().testPath });
});

export {};
