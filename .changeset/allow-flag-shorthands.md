---
"ggt": minor
---

Add `--allow` and `--allow-all` shorthands for commands with allow flags

Commands that define `--allow-*` flags now automatically support `--allow <flag,...>` and `--allow-all` as convenient shorthands. Unknown values suggest the closest match, and a bare `--allow` at end of argv throws a clear error.
