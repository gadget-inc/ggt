---
"ggt": patch
---

Fix crash when multiple spinners are active concurrently

Calling `spin()` while another spinner was already active caused an `AssertionError: a spinner is already active` crash (GGT-S7). Spinners are now tracked in a stack with idempotent finalization, and in interactive terminals all active spinners render simultaneously as separate lines.
