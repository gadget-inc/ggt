---
"ggt": patch
---

ggt can now recover from "Files version mismatch" errors! 🎉

Gadget has a concept of a "files version" which keeps track of the state of your Gadget environment's files. Every time your files change, Gadget increments your files version.

When ggt sends files to Gadget, it also sends along the files version it expects Gadget to be at. If Gadget's files version matches the one ggt sent, then Gadget will accept the changes and increment its files version. If Gadget's files version doesn't match the one ggt sent, then Gadget will refuse the changes and send back a "Files version mismatch" error like this:

```
Gadget responded with the following error:

  Files version mismatch, expected 67 but got 68
```

There are 2 common causes for this error:

- You make a change that causes Gadget to generate files and you don't receive those files before sending more changes to Gadget.

- Multiple people are syncing at the same time and one person sends changes to Gadget before receiving another persons changes.

Before, ggt didn't have a reliable way to detect and resolve de-syncs so it would crash and force you to restart 😞

However, now that [we've improved ggt's de-sync detection](https://github.com/gadget-inc/ggt/releases/tag/v0.4.0), it can automatically recover from "Files version mismatch" errors by re-syncing and continuing to watch for changes like normal!

If the changes that caused the "Files version mismatch" error are conflicting, then ggt will prompt you to choose which changes to keep before continuing to watch for more changes, the same way it does when you first start syncing. If you always want to keep your local changes during a "Files version mismatch" error, you can use the `--prefer=local` flag.

We hope this makes your development experience with Gadget more enjoyable.

Happy Holidays! 🎄🎁
