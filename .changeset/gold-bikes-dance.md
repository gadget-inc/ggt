---
"ggt": patch
---

Check the terminal environment before proceeding when running ggt

We don't want to allow users to run `ggt` in places where terminal commands can be run in the Gadget editor.

This change checks for special environment variables specific to Gadget and exits early if they are detected.
