import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/spec/**/*.spec.ts"],
    setupFiles: ["./spec/vitest.setup.ts"],
    testTimeout: process.env["CI"] ? 10_000 : 1000,
    watch: false,
    chaiConfig: {
      truncateThreshold: 10_000,
    },
    exclude: [".direnv/**/*.spec.ts"],
  },
});
