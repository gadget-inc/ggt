---
"ggt": major
---

`ggt logs` now prints recent logs and exits by default.

The previous streaming behavior now requires `--follow` (or `-f`).

This is a breaking CLI behavior change for users/scripts that relied on `ggt logs` streaming by default, and for users of the old `--tail` / `-t` flag names.

This release also adds one-shot filtering support for `--start` and `--level`.
