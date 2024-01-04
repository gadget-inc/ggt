import fs from "fs-extra";
import nock from "nock";
import process from "node:process";
import { beforeEach, expect } from "vitest";
import { mockConfig } from "./__support__/config.js";
import { mockContext } from "./__support__/context.js";
import { mockSideEffects } from "./__support__/mock.js";
import { testDirPath } from "./__support__/paths.js";
import { mockStdout } from "./__support__/stream.js";

beforeEach(async () => {
  // always set the environment to test
  process.env["GGT_ENV"] = "test";

  // always clear the test directory
  await fs.emptyDir(testDirPath());

  // don't memoize anything between tests
  const { clearMemoized } = await import("../src/services/util/function.js");
  clearMemoized();

  // always opt in to nock'd requests
  nock.cleanAll();

  return () => {
    // always assert that all nock'd requests were made
    expect(nock.pendingMocks()).toEqual([]);
  };
});

// always mock side effects
mockSideEffects();

// always mock context
mockContext();

// always mock stdout
mockStdout();

// always mock config
mockConfig();

export {};
