---
"ggt": patch
---

Handle existing files in the `.gadget/backup/` directory.

When `ggt` needs to backup a file that already exists in the `.gadget/backup/` directory, it will now remove the existing file before creating the backup. This should prevent the following error from occurring:

```
Error: ENOTDIR: not a directory, lstat '.gadget/backup/routes/webhooks/POST-github.js'
```
