import fs from "fs-extra";
import nock from "nock";
import { beforeEach, expect, vi } from "vitest";

import { installJsonExtensions, uninstallJsonExtensions } from "../src/services/util/json.js";
import { mockConfig, mockPackageJson } from "./__support__/config.js";
import { mockContext } from "./__support__/context.js";
import { mockSideEffects } from "./__support__/mock.js";
import { mockStdout } from "./__support__/output.js";
import { testDirPath } from "./__support__/paths.js";

beforeEach(async () => {
  vi.unstubAllEnvs();

  // always set the environment to test
  vi.stubEnv("GGT_ENV", "test");

  // always clear the test directory
  await fs.emptyDir(testDirPath());

  // always install JSON extensions
  installJsonExtensions();

  // don't memoize anything between tests
  const { clearMemoized } = await import("../src/services/util/function.js");
  clearMemoized();

  // always opt in to nock'd requests
  nock.cleanAll();

  return () => {
    // always assert that all nock'd requests were made
    expect(nock.pendingMocks()).toEqual([]);

    uninstallJsonExtensions();
  };
});

// always mock side effects
mockSideEffects();

// always mock context
mockContext();

// always mock stdout
mockStdout();

// always mock package.json
mockPackageJson();

// always mock config
mockConfig();

export {};
