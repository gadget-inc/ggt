---
"ggt": minor
---

Overhaul CLI help output with consistent, structured formatting

All commands now display structured help with USAGE, COMMANDS, FLAGS, and ARGUMENTS
sections. Two help levels are supported: `-h` shows a compact summary with a footer
pointing to `--help`, which shows full details including examples and prose sections.

Commands are grouped by category (Development, Resources, Account, Diagnostics,
Configuration) in the root help output. Flag descriptions are normalized as prose
in an expanded layout with bold group headers.

Internally, all commands have been migrated to a declarative `defineCommand()` API, replacing the previous imperative `usage(ctx)` pattern.
