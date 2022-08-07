process.env["GGT_ENV"] = "test";
import type { Config } from "@oclif/core";
import fs from "fs-extra";
import path from "path";

// tests in CI take longer to run than in local development
jest.setTimeout(process.env["CI"] ? 5000 : 1000);

export function testDirPath(): string {
  return path.join(__dirname, "..", "tmp", "tests", expect.getState().currentTestName.replace(/[ /,?=]/g, "-"));
}

export let config: Config;

beforeEach(async () => {
  const testDir = testDirPath();
  await fs.remove(testDir);

  // store files in the test's tmp directory
  // https://github.com/oclif/core/blob/main/src/config/config.ts#L171
  process.env["GGT_CONFIG_DIR"] = path.join(testDir, "config");
  process.env["GGT_CACHE_DIR"] = path.join(testDir, "cache");
  process.env["GGT_DATA_DIR"] = path.join(testDir, "data");

  const { Config } = await import("@oclif/core");
  config = (await Config.load(path.join(__dirname, ".."))) as Config;

  const { logger } = await import("../src/lib/logger");
  logger.info({ test: expect.getState().currentTestName, path: expect.getState().testPath }, "starting test");

  jest.spyOn(logger, "trace");
  jest.spyOn(logger, "debug");
  jest.spyOn(logger, "info");
  jest.spyOn(logger, "warn");
  jest.spyOn(logger, "error");
  jest.spyOn(logger, "fatal");
  jest.spyOn(logger, "configure").mockImplementation();

  // clear all mocks so that we can `expect(someFunction).not.toHaveBeenCalled()` in tests where someFunction was called in another test
  jest.clearAllMocks();
});

afterEach(async () => {
  const { logger } = await import("../src/lib/logger");
  logger.info({ test: expect.getState().currentTestName, path: expect.getState().testPath }, "ending test");
});

export {};
