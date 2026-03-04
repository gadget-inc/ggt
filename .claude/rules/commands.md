---
paths:
  - "src/commands/**"
  - "spec/commands/**"
  - "src/services/command/command.ts"
  - "src/services/command/arg.ts"
  - "src/services/command/run.ts"
  - "src/services/command/usage.ts"
---

# Commands

Each command is a file in `src/commands/` that default-exports a `defineCommand(...)` config:

- Leaf commands: `defineCommand({ description, args?, run, ... })`
- Parent commands: `defineCommand({ description, args?, subcommands: (sub) => ({ ... }), ... })`

### Field ordering

Fields in `defineCommand()` and `sub()` MUST follow this order (omit absent fields). MUST NOT have blank lines between fields.

1. `name` — command name (omitted in `sub()` — the object key serves as the name)
2. `aliases?` — alternate names (available on both top-level commands and subcommands)
3. `hidden?` — hide from root help and README
4. `description` — short description for shell completions and help listing
5. `details?` — extended description rendered in `--help` output
6. `sections?` — titled prose sections rendered after flags in `--help` output
7. `examples?` — example CLI invocations shown in help output
8. `positionals?` — positional argument definitions for the ARGUMENTS section
9. `args?` — optional `ArgsDefinition` (some commands like `whoami`, `version`, `login` have none)
10. `parseOptions?` — options passed to `parseArgs`
11. `run` (leaf) / `subcommands` (parent)

### Leaf-only fields

- `run` — `(ctx: Context, args: ArgsDefinitionResult<Args>) => Promisable<void>`

### Parent-only fields

- `subcommands` — `(sub) => Record<string, StoredSubcommand>` — each subcommand defined via `sub({ description, args?, run, ... })`. Subcommands do not support `sections`.

## Command list

The `Commands` array in `src/services/command/command.ts` determines order in help output and README.

- Development — `dev`, `deploy`, `push`, `pull`, `status`, `logs`, `debugger`
- Resources — `add`, `var`, `env`, `open`
- Account — `login`, `logout`, `whoami`, `list`
- Diagnostics — `problems`, `eval`
- Configuration — `configure`, `agent-plugin`, `version`

## Argument parsing

Arguments use the `arg` library. Define with `ArgsDefinition`, parse with `parseArgs()`:

```typescript
const args = {
  "--force": { type: Boolean, alias: "-f", description: "Force the operation" },
  "--prefer": { type: MergeConflictPreferenceArg, alias: "--prefer-preference", description: "..." },
} satisfies ArgsDefinition;
```

`ArgsDefinitionResult<Args>` infers types from handlers — args with `default` are non-nullable, others are `T | undefined`. All results include `_: string[]` for positional args.

## Loading and dispatch

Commands are loaded via dynamic `import()` in `importCommand()` (a switch statement over every command name). This avoids importing all commands upfront.

Dispatch is handled by `runCommand()` in `src/services/command/run.ts`, which parses args, routes subcommands, resolves aliases, and renders help.

## Adding a new command

1. Create `src/commands/<name>.ts` default-exporting `defineCommand({ ... })`
2. Add the command name to the `Commands` array in `src/services/command/command.ts`
3. Add a `case` to the switch in `importCommand()` in the same file

## Multiline strings

MUST use `sprint` template literals for multiline `details` and `sections[].content` strings. Do not use `[...].join("\n")`. Closing backtick aligned to the same column as the property name; content indented 2 spaces deeper:

```typescript
  details: sprint`
    Content here.
  `,
```

**Key files:** `src/services/command/command.ts`, `src/services/command/arg.ts`, `src/services/command/run.ts`, `src/services/command/usage.ts`
