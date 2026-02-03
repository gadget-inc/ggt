# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is ggt?

ggt is the command-line interface for the [Gadget](https://gadget.dev) platform. It synchronizes local files with Gadget's cloud filesystem, enabling local development with your preferred editor while keeping changes in sync with Gadget's environment.

## Common Commands

```bash
# Build (esbuild, outputs to dist/)
pnpm run build

# Run tests
pnpm exec vitest                    # Run all tests
pnpm exec vitest spec/commands/dev  # Run specific test file
pnpm exec vitest -t "test name"     # Run test by name

# Development mode (tests + build watch)
pnpm run dev

# Lint
pnpm run lint                       # Run all linters
pnpm run lint:fix                   # Auto-fix lint issues

# Generate GraphQL types
pnpm run generate:graphql
```

## Workflow

After making code changes:

1. Run `pnpm run lint:fix` to fix formatting issues
2. Run `pnpm exec vitest` to ensure tests pass (or run specific test files for targeted changes)

## Architecture

Entry point: `src/main.ts` -> `src/ggt.ts` -> `src/commands/root.ts` routes to individual commands
