---
"ggt": patch
---

Logging improvements:

- No longer truncating arrays in logs when `--json` is passed
- Now truncating objects in logs unless log level is trace
- Showing number of truncated elements/properties when arrays/objects are truncated
