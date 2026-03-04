---
"ggt": major
---

`ggt logs` now prints recent logs and exits by default.

Breaking changes:

- streaming now requires `--follow` / `-f`
- `--tail` / `-t` were removed

Also adds one-shot filtering with `--start` and `--log-level`.
