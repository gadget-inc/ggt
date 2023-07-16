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
    env: {
      NODE_ENV: "test",
      GGT_ENV: "test",
      FORCE_COLOR: "0", // disable chalk so that we get predictable output in tests
    },
    watch: false,
    hideSkippedTests: true,
    testTimeout: timeout,
    hookTimeout: timeout,
    threads: false,
    chaiConfig: {
      truncateThreshold: 10_000,
    },
  },
});
