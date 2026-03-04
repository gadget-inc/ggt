---
paths:
  - "src/commands/**"
  - "spec/commands/**"
  - "src/services/command/command.ts"
  - "src/services/command/arg.ts"
---

# Commands

Each command is a file in `src/commands/` exporting a `CommandModule<Args>`:

- `args?` — optional `ArgsDefinition` (some commands like `whoami`, `version`, `login` have none)
- `usage` — `(ctx: Context) => string`
- `run` — `(ctx: Context, args: ArgsDefinitionResult<Args>) => Promisable<void>`

## Command list

The `Commands` array in `src/services/command/command.ts` determines order in help output and README.

- Sync — `dev`, `deploy`, `push`, `pull`
- Status — `status`, `problems`
- Scaffolding — `add`
- Navigation — `open`, `list`
- Auth — `login`, `logout`, `whoami`
- Debug — `logs`, `debugger`
- Config — `configure`
- Other — `agent-plugin`, `eval`, `version`

## Argument parsing

Arguments use the `arg` library. Define with `ArgsDefinition`, parse with `parseArgs()`:

```typescript
export const args = {
  "--force": Boolean,
  "--prefer": { type: MergeConflictPreferenceArg, alias: "--prefer-preference" },
  "-f": "--force",
} satisfies ArgsDefinition;
```

`ArgsDefinitionResult<Args>` infers types from handlers — args with `default` are non-nullable, others are `T | undefined`. All results include `_: string[]` for positional args.

## Loading

Commands are loaded via dynamic `import()` in `importCommand()` (a switch statement over every command name). This avoids importing all commands upfront.

## Adding a new command

1. Create `src/commands/<name>.ts` exporting `usage`, `run`, and optionally `args`
2. Add the command name to the `Commands` array in `src/services/command/command.ts`
3. Add a `case` to the switch in `importCommand()` in the same file

**Key files:** `src/services/command/command.ts`, `src/services/command/arg.ts`
