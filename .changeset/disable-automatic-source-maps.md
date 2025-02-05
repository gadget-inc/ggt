---
ggt: patch
---

Don't automatically enable source maps

We introduced `--enable-source-maps` in v1.4.0 using the following shebang:

```
#!/usr/bin/env -S node --enable-source-maps
```

This change was made so that source maps would be enabled by default when running `ggt`, giving Gadget employees more information when `ggt` crashes. However, this has caused some issues with certain environments (e.g. `'-S' is not recognized as an internal or external command`), so we are reverting this change and will go back to the following shebang:

```
#!/usr/bin/env node
```

If you are running `ggt` and want source maps enabled, you can still do so by running `ggt` with the `NODE_OPTIONS` environment variable set to `--enable-source-maps`:

```
NODE_OPTIONS='--enable-source-maps' ggt
```
