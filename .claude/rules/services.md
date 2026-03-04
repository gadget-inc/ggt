---
paths:
  - "src/services/**/*"
  - "!src/services/filesync/**"
  - "spec/services/**/*"
  - "!spec/services/filesync/**"
---

# Services

## Directory overview

- **app/** — Gadget app interactions: GraphQL client, edit subscriptions, API operations
- **filesync/** — see `filesync.md`
- **command/** — CLI infrastructure: argument parsing, `Context`, app identity
- **output/** — Terminal output: spinners, colors, logging, prompts
- **http/** — HTTP client with auth
- **user/** — Session management
- **config/** — Configuration and environment variables
- **util/** — General utilities

## Context

`Context` (extends `AbortController`) flows through all operations. Defined in `src/services/command/context.ts`.

- `Context.init(options)` — creates root context with a logger
- `ctx.child(options)` — child context with inherited logger fields; auto-aborts when parent aborts
- `ctx.onAbort(callback)` — registers cleanup callbacks, called in **reverse order** (like Go's `defer`)
- `ctx.done` — `PromiseSignal` that resolves when all abort callbacks finish
- `ctx.signal` — standard `AbortSignal` for passing to async operations
- `ctx.log` — structured `Logger` (prints to stdout, logs to stderr)

## Error handling

Base class: `GGTError` in `src/services/output/report.ts`.

- `isBug` — `IsBug.YES` / `IsBug.NO` / `IsBug.MAYBE`
- `id` — UUID (fixed in tests)
- `render()` — abstract, returns user-friendly error message
- `sprint()` — `render()` + bug report link if `isBug !== NO`
- `print()` — writes `sprint()` to stdout

Subclasses:

- `UnexpectedError` (`isBug = YES`) — catch-all for unknown errors
- `EdgeCaseError` (`isBug = MAYBE`) — expected edge cases
- `ArgError` (`isBug = NO`) — invalid CLI arguments (in `src/services/command/arg.ts`)
- `ClientError` (`isBug = MAYBE`) — GraphQL/API errors (in `src/services/app/error.ts`)

`reportErrorAndExit(ctx, cause)` — converts cause to `GGTError`, prints it, sends to Sentry if `isBug !== NO`, then exits.

## Output

Defined in `src/services/output/`.

### Formatting

- `sprint` / `sprintln` — template literal tag combining `chalk-template` + `dedent`. Also accepts options form: `sprint({ content, indent, boxen, ensureNewLine, ensureEmptyLineAbove })`
- `println` / `print` — write formatted text to stdout (no-op in JSON mode unless `json` option is set)

### Interactive elements

- `spin(text | options)` — shows a spinner, returns `{ succeed, fail, clear }`
- `confirm(text | options)` — Y/n prompt, exits on No by default
- `select(options)` — arrow-key selection prompt

All interactive prompts check `output.isInteractive` and abort with an exit in non-interactive terminals.

## HTTP & auth

Uses `got` with hooks for logging and auth. Defined in `src/services/http/`.

- `loadAuthHeaders(ctx)` — returns auth headers (asserts they exist)
- `maybeLoadAuthHeaders(ctx)` — returns auth headers or `undefined`
- Supports cookie auth (`session=...`) and token auth (`x-platform-access-token: ...`)

**Key files:** `src/services/command/context.ts`, `src/services/output/report.ts`, `src/services/output/sprint.ts`, `src/services/app/error.ts`, `src/services/http/auth.ts`
