---
ggt: patch
---

Make `ggt deploy --force` skip asking for confirmation to push.

`ggt deploy --force` implies that you want to discard any existing changes on the environment you are deploying from, so it should not ask for confirmation to push.
