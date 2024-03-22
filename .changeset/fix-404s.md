---
ggt: patch
---

Fix `Unexpected server response: 404`

ggt was always using the `--development` url when subscribing to Gadget's GraphQL API. This was fine if your app had an environment named `development`, but would fail with a 404 if your app didn't have an environment named `development`.
