---
globs: src/services/**/*, !src/services/filesync/**
---

# Services

## Directory Overview

- **app/**: Gadget app interactions - GraphQL client, edit subscriptions, API operations
- **filesync/**: See `filesync.md` for details
- **command/**: CLI infrastructure - argument parsing, `Context` class (abort handling, logging)
- **output/**: Terminal output - spinners, colors, logging, prompts, confirmations
- **http/**: HTTP client with auth
- **user/**: Session management
- **config/**: Configuration and environment variables
- **util/**: General utilities

## Context Pattern

`Context` (extends `AbortController`) flows through all operations, providing:

- Structured logging via `ctx.log`
- Graceful shutdown via `ctx.onAbort()` callbacks
- Child contexts via `ctx.child()` for scoped operations
