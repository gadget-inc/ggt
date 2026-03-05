---
"ggt": patch
---

Fix `ggt eval` and log URLs using `--production` subdomain for production environments. Production uses just the app slug (e.g. `myapp.gadget.app`), not `myapp--production.gadget.app`.
