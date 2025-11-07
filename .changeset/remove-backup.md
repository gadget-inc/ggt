---
ggt: major
---

Remove the `.gadget/backup/` directory.

`ggt` will now permanently delete files from the local filesystem when receiving a “delete file” event, rather than moving them to `.gadget/backup/`.

The `.gadget/backup/` directory was introduced in v0.2.0, before Gadget supported git and source control, as a recovery mechanism for accidental deletions. However, it did not capture changes from “update file” events and became a frequent source of bugs.

Since local editors and source control now handle file recovery more reliably, this change removes the `.gadget/backup/` directory to simplify the codebase and reduce maintenance issues.
