---
"ggt": minor
---

We got the `ggt` npm package name! 🎉

Gadget now owns the `ggt` package on [NPM](https://www.npmjs.com/package/ggt)! This means you can turn this:

```sh
$ npx @gadgetinc/ggt@latest sync ~/gadget/example --app=example
```

Into this:

```sh
$ npx ggt@latest sync ~/gadget/example --app=example
```

If you've already installed `@gadgetinc/ggt` globally, you'll need to uninstall it first:

```sh
$ npm uninstall -g @gadgetinc/ggt
# or
$ yarn global remove @gadgetinc/ggt
```

Then you can install the `ggt` package:

```sh
$ npm install -g ggt@latest
# or
$ yarn global add ggt@latest
```

It's a small change, but it's less typing and easier to remember. We hope you enjoy it!

We're going to keep the `@gadgetinc/ggt` package up-to-date with the `ggt` package, so you can continue to use `@gadgetinc/ggt` if you prefer. We'll let you know if we ever decide to deprecate `@gadgetinc/ggt`.
