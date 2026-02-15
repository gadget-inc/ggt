# CLAUDE.md

## What is ggt?

ggt is the command-line interface for the [Gadget](https://gadget.dev) platform. It synchronizes local files with Gadget's cloud filesystem, enabling local development with your preferred editor while keeping changes in sync with Gadget's environment.

## Architecture

Entry point: `src/main.ts` → `src/ggt.ts` → `src/commands/root.ts` → individual commands

@CONTRIBUTING.md

## Before committing

MUST run `pnpm run lint:fix` to auto-fix formatting and lint issues, then `pnpm run lint` to verify all checks pass (formatting, linting, spelling, types). Fix any remaining issues before committing.
