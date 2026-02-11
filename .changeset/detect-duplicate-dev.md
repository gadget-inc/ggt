---
"ggt": minor
---

Add duplicate `ggt dev` run detection and show dev status in `ggt status`

Prevents multiple `ggt dev` processes from running simultaneously in the same directory using an atomic lock file. Stale locks from crashed processes are automatically cleaned up. `ggt status` now reports whether `ggt dev` is currently running.
