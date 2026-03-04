---
"ggt": major
---

Change `ggt logs` default behavior to one-shot output and add `--follow` (`-f`) for streaming.

`ggt logs` now prints recent logs and exits by default.

This is a breaking change:

- `ggt logs` no longer streams unless you pass `--follow` (`-f`)
- `--tail` / `-t` are removed

If you have scripts that rely on streaming logs, update:

- `ggt logs` → `ggt logs --follow`
- `ggt logs --tail` / `ggt logs -t` → `ggt logs --follow` / `ggt logs -f`

This release also adds one-shot filtering support for `--start` and `--level`.
