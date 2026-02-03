# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is ggt?

ggt is the command-line interface for the [Gadget](https://gadget.dev) platform. It synchronizes local files with Gadget's cloud filesystem, enabling local development with your preferred editor while keeping changes in sync with Gadget's environment.

## Quick Reference

```bash
# Development
pnpm run build                      # Build (outputs to dist/)
pnpm run dev                        # Build + test in watch mode
pnpm run generate:graphql           # Regenerate GraphQL types

# Before committing (always run both)
pnpm run lint:fix                   # Fix formatting issues
pnpm exec vitest                    # Run tests (or specific file: spec/commands/dev)
```

## Architecture

Entry point: `src/main.ts` → `src/ggt.ts` → `src/commands/root.ts` → individual commands

See [CONTRIBUTING.md](CONTRIBUTING.md) for full setup instructions, testing details, and contribution workflow.
