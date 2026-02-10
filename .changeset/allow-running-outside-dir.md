---
"ggt": patch
---

Allow some commands to run fully outside a synced folder

Commands like `ggt open`, `ggt debugger`, and `ggt logs` can now run outside a synced folder. They will use the existing context from the currently synced folder if available, but can also be run with `--app` and `--env` flags or interactive prompts to specify the target app and environment.
