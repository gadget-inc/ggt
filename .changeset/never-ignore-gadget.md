---
ggt: patch
---

# Never ignore `.gadget/` directory

This change ensures that the `.gadget/` directory is never ignored even if it is listed in the `.ignore` file. The `.gadget/` directory is managed by ggt and ignoring it causes issues like infinite sync loops.
