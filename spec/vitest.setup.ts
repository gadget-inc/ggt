import fs from "fs-extra";
import nock from "nock";
import { beforeEach, vi } from "vitest";
import { config } from "../src/services/config/config.js";
import { clearMemoized } from "../src/services/util/function.js";
import { testDirPath } from "./__support__/paths.js";
import { mockStdout } from "./__support__/stdout.js";

mockStdout();

beforeEach(async () => {
  process.env["GGT_ENV"] = "test";

  await fs.emptyDir(testDirPath());

  // store files in the test's tmp directory
  vi.spyOn(config, "configDir", "get").mockReturnValue(testDirPath("config"));
  vi.spyOn(config, "cacheDir", "get").mockReturnValue(testDirPath("cache"));
  vi.spyOn(config, "dataDir", "get").mockReturnValue(testDirPath("data"));

  // always opt in to nock'd requests
  nock.cleanAll();

  // don't memoize anything between tests
  clearMemoized();
});

vi.mock("execa", () => ({ execa: vi.fn().mockName("execa").mockResolvedValue({}) }));
vi.mock("get-port", () => ({ default: vi.fn().mockName("getPort").mockResolvedValue(1234) }));
vi.mock("node-notifier", () => ({ default: { notify: vi.fn().mockName("notify") } }));
vi.mock("open", () => ({ default: vi.fn().mockName("open") }));
vi.mock("which", () => ({ default: { sync: vi.fn().mockName("whichSync").mockReturnValue("/path/to/yarn") } }));

export {};
