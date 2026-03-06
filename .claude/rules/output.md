---
paths:
  - "src/**"
  - "spec/**"
---

# Output System

All user-facing text goes through `src/services/output/`. Never use `console.log` or raw `process.stdout.write`.

## sprint / sprintln — string builders

`sprint` returns a string. `sprintln` is identical but appends a trailing newline.

Both accept three call signatures:

1. **Tagged template** (preferred for multiline) — strips indentation via `ts-dedent` and aligns multi-line interpolated values:
   ```typescript
   sprint`
     Hello, ${name}!
     How are you?
   `;
   // => "Hello, Jane!\nHow are you?"
   ```
2. **Plain string** — returned as-is: `sprint("hello")`
3. **Options object** — `sprint({ content: "hello", ensureEmptyLineAbove: true })`

Options: `ensureNewLine`, `ensureEmptyLineAbove`, `boxen` (wraps in a box).

MUST use `sprint` tagged templates for any multiline string — command `details`, `sections[].content`, test fixtures, etc. Do not use `[...].join("\n")` or unindented template literals. Closing backtick aligned to the same column as the property name; content indented 2 spaces deeper:

```typescript
  details: sprint`
    Content here.
  `,
```

## print / println — write to stdout

`print` writes to stdout (via `output.writeStdout`). `println` appends a trailing newline. Same three call signatures as `sprint`.

When `--json` mode is active, `print` only outputs the `json` field (if provided) as `JSON.stringify` and suppresses the human-readable content.

```typescript
println`Pushing files...`;
println({ ensureEmptyLineAbove: true, content: "Done!" });
println({ content: "result", json: { status: "ok" } });
```

## colors — semantic color tokens

Import `colors` from `src/services/output/colors.ts`. Always use semantic names, never raw chalk:

- **Text roles:** `error`, `link`, `subdued`, `identifier`, `placeholder`, `header`, `hint`, `prompt`, `code`
- **Values:** `plain`, `number`, `boolean`
- **Outcomes:** `success`, `warning`, `emphasis`
- **Filesync:** `created`, `updated`, `deleted`, `renamed`
- **Logs:** `logName`, `levelBadgeText`, `levelPrint/Trace/Debug/Info/Warn/Error`

```typescript
println`${colors.success(`${symbol.tick} Done`)}`;
```

## symbol — unicode symbols

Import `symbol` from `src/services/output/symbols.ts`. Provides platform-consistent symbols (`tick`, `cross`, `pointer`, `bullet`, etc.). In tests, always uses `mainSymbols` for cross-platform consistency.

## Other output utilities

- **spinner** — `startSpinner(options)` for progress indicators
- **table** — `printTable` / `sprintTable` for columnar output
- **footer** — `footer` for trailing help text
- **confirm / select / prompt** — interactive prompts (mock in tests via `mockConfirm`, `mockSelect`)

**Key files:** `src/services/output/sprint.ts`, `src/services/output/print.ts`, `src/services/output/colors.ts`, `src/services/output/symbols.ts`
