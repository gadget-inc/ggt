---
"ggt": minor
---

Improvements to `ggt sync`!

### Improved de-sync detection and conflict resolution:

`ggt sync` can now detect all discrepancies between your local filesystem and your Gadget environment's filesystem. Previously, if a file was deleted locally while `ggt sync` was not running, `ggt sync` could not detect that the file was deleted and would not delete the file in your Gadget environment.

Now, `ggt sync` can detect the following discrepancies:

- Files that exist locally but not in your Gadget environment
- Files that exist in your Gadget environment but not locally
- Files that exist locally and in your Gadget environment but have different contents
- Files that exist locally and in your Gadget environment but have different permissions
  - Only supported when the local filesystem is macOS or Linux

When `ggt sync` starts, it will compare your local filesystem to your Gadget environment's filesystem and calculate the changes that have occurred since the last time `ggt sync` was run.

You will be prompted to resolve conflicts if:

- Both filesystems updated the same file with different contents
- One filesystem updated a file and the other deleted it

Otherwise, `ggt sync` will automatically merge the changes from both filesystems and begin watching for changes.

With the new de-sync detection in place, we now _have the technology_ to solve the dreaded "Files version mismatch" error that causes `ggt sync` to crash so often. Be on the lookout for a fix to this error in the near future! 👀

### New `--prefer` flag:

`ggt sync` has a new `--prefer` flag that will resolve conflicts in favor of the specified filesystem. This is useful if you always want to resolve conflicts in favor of your local filesystem or your Gadget environment's filesystem.

```sh
# keep your local filesystem's conflicting changes
$ ggt sync --prefer=local

# keep your Gadget environment's conflicting changes
$ ggt sync --prefer=gadget
```

### New `--once` flag:

`ggt sync` has a new `--once` flag that will only sync local filesystem once and then exit. This flag in combination with `--prefer` is useful if you want to run `ggt sync` in a script or CI/CD pipeline and ensure that the sync will not hang waiting for user input.

```sh
$ ggt sync --once --prefer=local
```
