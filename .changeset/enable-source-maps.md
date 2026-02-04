---
"ggt": patch
---

Re-enable source maps programmatically

Source maps are now enabled using `process.setSourceMapsEnabled(true)` at startup,
providing TypeScript source locations in stack traces instead of bundled JavaScript.
