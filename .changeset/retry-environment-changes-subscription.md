---
"ggt": patch
---

Automatically retry WebSocket subscriptions after transient errors

Subscriptions now resubscribe on transient errors (such as "No connection established. Last error: null" or a dropped connection) instead of ending the command. This keeps `ggt dev` and `ggt logs` alive through brief network blips, and a transient connection error no longer fails a `ggt deploy`. Terminal errors — authentication failures, payment/upgrade requirements, and server-signalled internal errors — still surface immediately.
