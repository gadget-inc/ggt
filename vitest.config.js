import { defineConfig } from "vitest/config";

let timeout = 30_000;
if (process.env["CI"]) {
  timeout *= 2;
}

export default defineConfig({
  test: {
    include: ["**/spec/**/*.spec.ts"],
    exclude: [".direnv/**/*.spec.ts"],
    setupFiles: ["./spec/vitest.setup.ts"],
    watch: false,
    hideSkippedTests: true,
    testTimeout: timeout,
    hookTimeout: timeout,
    chaiConfig: {
      truncateThreshold: 10_000,
    },
  },
});
