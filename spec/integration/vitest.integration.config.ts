import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["./spec/integration/**/*.spec.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    watch: false,
    hideSkippedTests: true,
  },
});
