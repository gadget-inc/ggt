---
"ggt": patch
---

Automatically retry long-running WebSocket subscriptions after transient errors

`ggt dev` (file sync) and `ggt logs` now resubscribe on transient errors such as "No connection established. Last error: null" instead of ending the command. Retry is enabled by default for subscriptions. `ggt deploy` opts out and surfaces errors immediately, because resubscribing would restart the in-flight deploy.
