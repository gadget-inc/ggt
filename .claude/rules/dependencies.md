# Dependencies

ggt is bundled with esbuild into a single distributable. All packages MUST be added as `devDependencies`, never `dependencies`. The published CLI should have zero runtime dependencies — esbuild bundles everything at build time.

Use `pnpm add -D <package>`, never `pnpm add <package>`.
