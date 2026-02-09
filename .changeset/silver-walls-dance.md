---
"ggt": patch
---

Add automatic retry for WebSocket subscriptions

Adds retry logic with exponential backoff for transient WebSocket connection
failures during file sync subscriptions. This improves reliability when network
connectivity is unstable or the server experiences temporary issues.
