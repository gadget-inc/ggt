# Contributing to `ggt`

Contributions to `ggt` are welcomed from all! Contributors must adhere to the Code of Conduct for the ggt product, outlined in the CODE_OF_CONDUCT.md document.

## System dependencies

`ggt` uses Nix to manage system dependencies like `node` and `npm`. You don't need to use Nix to contribute to `ggt`, but it does make things easier!

If you don't use Nix, `ggt` needs the following system dependencies to develop:

- `node` >= v16
- `npm` >= v8
- `git` >= v2

### Gadget Staff

To develop against the Gadget development environment, you'll also need:

- `mkcert`

## Development

We use `npm` to manage dependencies and scripts. To install dependencies, run:

```shell
npm install
```

Once dependencies are installed, you can run `ggt` via `bin/dev.js`:

```shell-session
$ bin/dev.js --help
The command-line interface for Gadget

VERSION
  @gadgetinc/ggt/0.1.16 darwin-arm64 node-v16.18.1

USAGE
  $ ggt [COMMAND]

COMMANDS
  help    Display help for ggt.
  list    List the apps available to the currently logged in user.
  login   Log in to your account.
  logout  Log out of your account.
  sync    Sync your Gadget application's source code to and from your local filesystem.
  whoami  Show the name and email address of the currently logged in user.
```

Using `bin/dev.js` runs `ggt` using the source code in the `src` directory. This means you can make changes to the source code and see them reflected immediately every time you run `bin/dev.js`.

The other differences between `bin/dev.js` and `ggt` are:

1. By default, `bin/dev.js` runs against the development version of Gadget used by Gadget staff. This is because `bin/dev.js` defaults the `GGT_ENV` environment variable to `"development"`. You can override `GGT_ENV` to use the production Gadget platform by using `GGT_ENV=production bin/dev.js`.

2. `bin/dev.js` looks for and stores files in a `tmp` directory at the root of the project. This directory is ignored by git, so you can use it to store temporary files without worrying about accidentally committing them.

   Here's where `bin/dev.js` stores and looks for files compared to `ggt` on macOS:

   - `~/Library/Caches/ggt` -> `tmp/cache`
   - `~/.config/ggt` -> `tmp/config`
   - `~/.data/ggt` -> `tmp/data`

### Tips

- If you want more verbose output from `ggt`, you can pass the `--debug` flag:

  ```shell-session
  $ bin/dev.js whoami --debug
  ggt:fs-utils ignoring ENOENT error tmp/config/session.txt +0ms
  You are not logged in
  ```

  We use the [debug](https://www.npmjs.com/package/debug) package to log debug messages. When you pass the `--debug` flag, `ggt` will log all debug messages in the `ggt:*` namespace. If you want to log debug messages for all namespaces, you can use the `DEBUG` environment variable directly.

- If you're working on file sync, you can `ggt sync` apps into the `tmp/apps` directory. This way, you can have your synced files and `ggt` code in the same directory without worrying about them interfering with each other.

## Testing

`ggt`'s tests live in the `spec` directory and are written using [Vitest](https://vitest.dev/). You can run them via `npm run test`:

```shell-session
$ npm run test

> ggt@0.2.1 test
> cross-env NODE_OPTIONS="--no-warnings --loader ./node_modules/ts-node/esm.mjs" vitest


 RUN  v0.32.2 /Users/scott/Code/gadget/ggt

 ✓ spec/services/context.spec.ts (18) 756ms
 ✓ spec/commands/whoami.spec.ts (3) 524ms
 ✓ spec/commands/logout.spec.ts (3) 554ms
 ✓ spec/commands/list.spec.ts (3) 534ms
 ✓ spec/commands/login.spec.ts (1) 523ms
 ✓ spec/services/base-command.spec.ts (18) 537ms
 ✓ spec/services/flags.spec.ts (10) 514ms
 ✓ spec/services/errors.spec.ts (10)
 ✓ spec/commands/sync.spec.ts (52) 36980ms

 Test Files  9 passed (9)
      Tests  117 passed | 1 todo (118)
   Start at  17:54:44
   Duration  38.30s (transform 573ms, setup 538ms, collect 4.00s, tests 41.20s, environment 1ms, prepare 754ms)
```

Tests also make use of the `tmp` directory. Every test gets its own directory in `tmp/<spec-file>/<test-name>` to store temporary files. This means you can run tests in parallel without worrying about them interfering with each other.

<!-- TODO -->

<!-- ## Pull Requests -->

<!-- ## Releasing -->
