---
ggt: patch
---

Never ignore `.gadget/` directory

ggt no longer ignores the `.gadget/` directory when it is listed in the `.ignore` file. The `.gadget/` directory is managed by ggt and ignoring it causes issues like infinite sync loops.
