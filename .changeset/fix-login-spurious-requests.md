---
"ggt": patch
---

Fix login crash when receiving spurious HTTP requests without a session parameter

The login callback server now ignores requests that don't include a `session` query parameter (e.g. favicon requests, health checks, port-forwarding probes in GitHub Codespaces) instead of crashing with an `AssertionError`.
