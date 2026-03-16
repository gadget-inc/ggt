# CLAUDE.md

## What is ggt?

ggt is the command-line interface for the [Gadget](https://gadget.dev) platform. It synchronizes local files with Gadget's cloud filesystem, enabling local development with your preferred editor while keeping changes in sync with Gadget's environment.

## Architecture

Entry point: `src/main.ts` → `src/ggt.ts` → `src/commands/root.ts` → individual commands

@CONTRIBUTING.md

## Running the CLI in this repo

From `CONTRIBUTING.md` / `nix/flake.nix`:

- `ggt` runs `dist/main.js` with `GGT_ENV=production` (targets production Gadget)
- `dggt` runs `dist/main.js` with `GGT_ENV=development` (targets development Gadget; Gadget staff flow)

Because both wrappers run `dist/main.js`, build first:

- `pnpm run build` (or `pnpm run build:watch` while iterating)

Prefer running via the repo dev shell:

- `direnv exec . ggt ...`
- `direnv exec . dggt ...`

## Local E2E / smoke-test workspace

Use `tmp/apps/` for pulled test apps and command smoke tests. `tmp/` is gitignored, so this keeps test artifacts out of source-controlled paths.

Recommended flow:

1. `mkdir -p tmp/apps/<test-name> && cd tmp/apps/<test-name>`
2. `direnv exec . dggt login` (if needed)
3. `direnv exec . dggt pull -a <app> -e <env>`
4. Run test commands in that pulled app dir, passing explicit app/env flags (e.g. `dggt action add ... -a <app> -e <env>`)

## Before committing

MUST run `pnpm run lint:fix` to auto-fix formatting and lint issues, then `pnpm run lint` to verify all checks pass (formatting, linting, spelling, types). Run `pnpm test` on affected test files. Fix any remaining issues before committing.
