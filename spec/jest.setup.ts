process.env["GGT_ENV"] = "test";

import fs from "fs-extra";
import path from "path";

jest.setTimeout(1000);

export function testDirPath(): string {
  return path.join(__dirname, "..", "tmp", "tests", expect.getState().currentTestName.replace(/[ /,?=]/g, "-"));
}

beforeEach(async () => {
  const testDir = testDirPath();
  await fs.remove(testDir);

  const { Env } = await import("../src/lib/env");
  jest.spyOn(Env, "paths", "get").mockReturnValue({
    cache: path.join(testDir, "cache"),
    config: path.join(testDir, "config"),
    data: path.join(testDir, "data"),
    log: path.join(testDir, "log"),
    temp: path.join(testDir, "temp"),
  });

  const { Config } = await import("../src/lib/config");
  jest.spyOn(Config, "save");

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
