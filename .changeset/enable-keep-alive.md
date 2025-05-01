---
"ggt": patch
---

Enable `keepAlive` in the graphql-ws client to keep the connection alive.

Users have pointed out that `ggt dev` stops receiving file updates sometimes after their computer has gone to sleep.

This fixes that issue by enabling the `keepAlive` option in the graphql-ws client. This makes the client send a ping every few seconds to the server to ensure the connection is still alive. Luckily for us, we've already implemented the pong handler on our servers because we use this same pattern in our editor!
