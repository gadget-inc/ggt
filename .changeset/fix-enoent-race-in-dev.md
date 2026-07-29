---
"ggt": patch
---

Fix crash during `ggt dev` when a file is deleted between stat and read

Handle ENOENT errors from `fs.readFile()` in `_sendChangesToEnvironment` the same way they're already handled for `fs.stat()` — by skipping the file instead of crashing the session.
