import { defineConfig } from "vitest/config";
import { timeoutMs } from "./src/services/timeout.js";

export default defineConfig({
  test: {
    include: ["**/spec/**/*.spec.ts"],
    exclude: [".direnv/**/*.spec.ts"],
    setupFiles: ["./spec/vitest.setup.ts"],
    env: {
      NODE_ENV: "test",
      GGT_ENV: "test",
      FORCE_COLOR: "0", // so that we get predictable output in tests
    },
    clearMocks: true, // so that we can `expect(someFunction).not.toHaveBeenCalled()` in tests where someFunction was called in another test
    watch: false,
    hideSkippedTests: true,
    testTimeout: timeoutMs("30s"),
    hookTimeout: timeoutMs("30s"),
    threads: true,
    chaiConfig: {
      truncateThreshold: 10_000,
    },
  },
});
