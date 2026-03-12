---
"ggt": patch
---

Replace node-notifier with terminal bell for crash notifications

Drop the `node-notifier` dependency and CJS shim in favor of writing a BEL character (`\x07`) to stderr. This triggers the terminal's native attention mechanism (dock bounce on macOS, taskbar flash on Linux/Windows) without any platform-specific code or external dependencies.
