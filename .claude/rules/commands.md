---
globs: src/commands/**
---

# Commands

Each command (dev, deploy, push, pull, etc.) is a module exporting:

- `args`: Command-line argument definitions
- `usage`: Help text function
- `run`: Command execution function

Commands are registered in `src/services/command/command.ts` (the `Commands` array).
