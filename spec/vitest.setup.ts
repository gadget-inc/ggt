import Debug from "debug";
import fs from "fs-extra";
import _ from "lodash";
import path from "path";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { testDebug, testDirPath } from "./util.js";

// disable chalk so that we get predictable output in tests
process.env["FORCE_COLOR"] = "0";

beforeEach(async () => {
  process.env["GGT_ENV"] = "test";

  testDebug("starting %O", { test: expect.getState().currentTestName, path: expect.getState().testPath });

  const testDir = testDirPath();
  await fs.remove(testDir);

  // store files in the test's tmp directory
  // https://github.com/oclif/core/blob/main/src/config/config.ts#L171
  process.env["GGT_CONFIG_DIR"] = path.join(testDir, "config");
  process.env["GGT_CACHE_DIR"] = path.join(testDir, "cache");
  process.env["GGT_DATA_DIR"] = path.join(testDir, "data");

  const { Config, Command } = await import("@oclif/core");
  if (process.env["DEBUG"]) {
    Debug.log = console.log.bind(console);
    Debug.enable(process.env["DEBUG"]);
  }

  const { context } = await import("../src/services/context.js");
  context.clear();
  context.config = await Config.load(path.join(__dirname, ".."));

  vi.spyOn(Command.prototype, "log").mockImplementation(_.noop);
  vi.spyOn(Command.prototype, "warn").mockImplementation(_.noop as any);
  vi.spyOn(Command.prototype, "error").mockImplementation(_.noop as any);

  // clear all mocks so that we can `expect(someFunction).not.toHaveBeenCalled()` in tests where someFunction was called in another test
  vi.clearAllMocks();
});

afterEach(() => {
  testDebug("ending %O", { test: expect.getState().currentTestName, path: expect.getState().testPath });
});

vi.mock("execa", () => ({ execa: vi.fn().mockName("execa").mockResolvedValue({}) }));
vi.mock("get-port", () => ({ default: vi.fn().mockName("getPort").mockResolvedValue(1234) }));
vi.mock("inquirer", () => ({ default: { prompt: vi.fn().mockName("prompt").mockResolvedValue({}) } }));
vi.mock("node-notifier", () => ({ default: { notify: vi.fn().mockName("notify") } }));
vi.mock("open", () => ({ default: vi.fn().mockName("open") }));
vi.mock("which", () => ({ default: { sync: vi.fn().mockName("whichSync").mockReturnValue("/path/to/yarn") } }));

export {};
