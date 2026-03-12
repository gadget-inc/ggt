import { defineConfig } from "rolldown";

const isWatch = process.argv.includes("-w") || process.argv.includes("--watch");

export default defineConfig({
  input: "src/main.ts",
  platform: "node",
  output: {
    dir: "dist",
    format: "es",
    sourcemap: true,
    banner: (chunk) => (chunk.isEntry ? "#!/usr/bin/env node" : ""),
    minify: isWatch
      ? false
      : {
          compress: true,
          mangle: { keepNames: true },
        },
  },
});
