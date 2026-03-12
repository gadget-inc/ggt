---
"ggt": patch
---

Fix chmod ENOENT race condition during file sync

Handle the case where a file is deleted between `fs.outputFile()` and `fs.chmod()` during sync by swallowing the ENOENT error, matching the existing pattern used elsewhere in the file.
