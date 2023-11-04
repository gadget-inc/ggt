import fs from "fs-extra";
import { beforeEach, vi } from "vitest";
import { config } from "../src/services/config.js";
import { testDirPath, testStdout } from "./util.js";

beforeEach(async () => {
  process.env["GGT_ENV"] = "test";

  await fs.emptyDir(testDirPath());

  // store files in the test's tmp directory
  vi.spyOn(config, "configDir", "get").mockReturnValue(testDirPath("config"));
  vi.spyOn(config, "cacheDir", "get").mockReturnValue(testDirPath("cache"));
  vi.spyOn(config, "dataDir", "get").mockReturnValue(testDirPath("data"));

  // write to in-memory stdout/stderr instead of real stdout/stderr
  const { Stream } = await import("../src/services/print.js");
  Stream.prototype.write = function (data) {
    testStdout.push(data);
    return true;
  };

  // clear testOutput so that we can `expect(testOutput).not.toContain("some output")` in tests where "some output" was output in another test
  testStdout.length = 0;

  // clear all mocks so that we can `expect(someFunction).not.toHaveBeenCalled()` in tests where someFunction was called in another test
  vi.clearAllMocks();
});

vi.mock("execa", () => ({ execa: vi.fn().mockName("execa").mockResolvedValue({}) }));
vi.mock("get-port", () => ({ default: vi.fn().mockName("getPort").mockResolvedValue(1234) }));
vi.mock("node-notifier", () => ({ default: { notify: vi.fn().mockName("notify") } }));
vi.mock("open", () => ({ default: vi.fn().mockName("open") }));
vi.mock("which", () => ({ default: { sync: vi.fn().mockName("whichSync").mockReturnValue("/path/to/yarn") } }));

export {};
