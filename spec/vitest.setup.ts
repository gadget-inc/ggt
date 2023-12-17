import fs from "fs-extra";
import nock from "nock";
import process from "node:process";
import { beforeEach, vi } from "vitest";
import { spyOnImplementing } from "vitest-mock-process";
import { testDirPath } from "./__support__/paths.js";
import { mockStdout } from "./__support__/stream.js";

// mock these dependencies with consistent/no-op implementations
vi.mock("execa", () => ({ execa: vi.fn().mockName("execa").mockResolvedValue({}) }));
vi.mock("get-port", () => ({ default: vi.fn().mockName("getPort").mockResolvedValue(1234) }));
vi.mock("node-notifier", () => ({ default: { notify: vi.fn().mockName("notify") } }));
vi.mock("open", () => ({ default: vi.fn().mockName("open") }));
vi.mock("which", () => ({ default: { sync: vi.fn().mockName("whichSync").mockReturnValue("/path/to/yarn") } }));

// always mock stdout
mockStdout();

beforeEach(async () => {
  process.env["GGT_ENV"] = "test";
  await fs.emptyDir(testDirPath());

  // always opt in to nock'd requests
  nock.cleanAll();

  // don't memoize anything between tests
  const { clearMemoized } = await import("../src/services/util/function.js");
  clearMemoized();

  // store config files in the current test's tmp directory
  const { config } = await import("../src/services/config/config.js");
  vi.spyOn(config, "configDir", "get").mockReturnValue(testDirPath("config"));
  vi.spyOn(config, "cacheDir", "get").mockReturnValue(testDirPath("cache"));
  vi.spyOn(config, "dataDir", "get").mockReturnValue(testDirPath("data"));

  // always opt in to interactive prompts
  const prompt = await import("../src/services/output/prompt.js");
  spyOnImplementing(prompt, "confirm", () => {
    throw new Error("prompt.confirm() should not be called");
  });

  spyOnImplementing(prompt, "select", () => {
    throw new Error("prompt.select() should not be called");
  });

  // we don't ever want to actually exit the process during tests so
  // print the current stack trace so we can see where the exit was
  // called
  spyOnImplementing(process, "exit", (code) => {
    process.stderr.write(new Error(`process.exit(${code})`).stack + "\n");
    process.exit.mockRestore?.();
    process.exit(code);
  });
});

export {};
