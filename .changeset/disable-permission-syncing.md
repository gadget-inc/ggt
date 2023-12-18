---
ggt: patch
---

Disabled file permission syncing

We have temporarily disabled the ability to sync file permissions between your local filesystem and your Gadget environment. This is due to a bug that is causing permissions not to be set correctly when changed via `ggt sync`. We have created a ticket to track this issue and will re-enable this feature once it is resolved.

In the meantime, if you need to change a file's permissions in your Gadget environment, you can do so by opening the command palette by pressing `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS) and running `chmod` on the file directly.

Here's an example of how to change the permissions on a file named `test.sh` to be executable:

![CleanShot 2023-12-18 at 17 58 10@2x](https://github.com/gadget-inc/ggt/assets/21965521/13f06911-6abe-4ee5-ad63-0446ba65b62f)
