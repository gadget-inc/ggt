---
"ggt": minor
---

`ggt logs` now prints recent logs and exits by default. The previous streaming behavior is available via the new `--tail` / `-t` flag. `ggt logs` also has new options to filter the returned logs via `--start`, `--end`, `--direction`, and `--level` flags, to allow filtering logs by time range, ordering, and severity.
