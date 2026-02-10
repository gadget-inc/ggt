import { defineConfig } from "vitest/config";

import { timeoutMs } from "./spec/__support__/sleep.js";

export default defineConfig({
  test: {
    include: ["./spec/**/*.spec.ts"],
    setupFiles: ["./spec/vitest.setup.ts"],
    globalSetup: "./spec/vitest.global-setup.ts",
    clearMocks: true, // so that we can `expect(someFunction).not.toHaveBeenCalled()` in tests where someFunction was called in another test
    watch: false,
    hideSkippedTests: true,
    testTimeout: timeoutMs("10s"),
    hookTimeout: timeoutMs("10s"),
    env: {
      NODE_ENV: "test",
      GGT_ENV: "test",
      FORCE_COLOR: "0", // so that we get predictable output in tests
    },
    chaiConfig: {
      truncateThreshold: 10_000,
    },
  },
});
