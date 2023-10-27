# Contributing to `ggt`

Contributions to `ggt` are welcomed from all! Contributors must adhere to the Code of Conduct for the ggt product, outlined in the [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) document.

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
  ggt/0.3.2 darwin-arm64 node-v16.18.1

USAGE
  $ ggt [COMMAND]

FLAGS
  -h, --help     Print command's usage
  -v, --version  Print version
      --debug    Print debug output

COMMANDS
  sync    Sync your Gadget application's source code to and
          from your local filesystem.
  list    List your apps.
  login   Log in to your account.
  logout  Log out of your account.
  whoami  Print the currently logged in account.
```

Using `bin/dev.js` runs `ggt` using the source code in the `src` directory. This means you can make changes to the source code and see them reflected immediately every time you run `bin/dev.js`.

The other differences between `bin/dev.js` and `ggt` are:

1. By default, `bin/dev.js` runs against the development version of Gadget used by Gadget staff. This is because `bin/dev.js` defaults the `GGT_ENV` environment variable to `"development"`. You can override `GGT_ENV` to use the production Gadget platform by using `GGT_ENV=production bin/dev.js`.

2. `bin/dev.js` looks for and stores files in a `tmp` directory at the root of the project. This directory is ignored by git, so you can use it to store temporary files without worrying about accidentally committing them.

   Here's where `bin/dev.js` stores and looks for files compared to `ggt` on macOS:

   - `~/Library/Caches/ggt` -> `tmp/cache`
   - `~/.config/ggt` -> `tmp/config`
   - `~/.data/ggt` -> `tmp/data`

### Environment Variables

`ggt` uses the following environment variables to configure its behavior:

- `GGT_ENV`
  - The environment to run `ggt` in.
  - Defaults to `"production"`.
  - If you're a Gadget staff member, you can set this to `"development"` to run against the development version of Gadget.
- `GGT_SENTRY_ENABLED`
  - Whether to enable Sentry error reporting.
  - Defaults to `"true"`.
- `GGT_SESSION`
  - The session to use when sending requests to the Gadget API.
  - Defaults to the contents of `GGT_CONFIG_DIR/session.txt`.
- `GGT_CONFIG_DIR`
  - The directory to store `ggt`'s configuration files in.
  - Defaults:
    - Unix: `~/.config/ggt`
    - Windows: `%LOCALAPPDATA%\ggt`
- `GGT_CACHE_DIR`
  - The directory to store `ggt`'s cache files in.
  - Defaults:
    - macOS: `~/Library/Caches/ggt`
    - Linux: `~/.config/ggt`
    - Windows: `%LOCALAPPDATA%\ggt`
- `GGT_DATA_DIR`
  - The directory to store `ggt`'s data files in.
  - Defaults:
    - Unix: `~/.local/share/ggt`
    - Windows: `%LOCALAPPDATA%\ggt`

### Tips

- If you want more verbose output from `ggt`, you can pass the `--debug` flag:

  ```shell-session
  $ bin/dev.js whoami --debug
    ggt:session reading session from disk +0ms
    ggt:fs      swallowing enoent error   { path: 'session.txt' } +0ms
  You are not logged in
  ```

  We use the [debug](https://www.npmjs.com/package/debug) package to log debug messages. When you pass the `--debug` flag, `ggt` will log all debug messages in the `ggt:*` namespace. If you want to log debug messages for all namespaces, you can use the `DEBUG` environment variable directly (e.g. `DEBUG='*' bin/dev.js`)

- If you're working on file sync, you can `ggt sync` apps into the `tmp/apps` directory. This way, you can have your synced files and `ggt` code in the same directory without worrying about them interfering with each other.

## Testing

`ggt`'s tests live in the `spec` directory and are written using [Vitest](https://vitest.dev/). You can run them via `npm run test`:

```shell-session
$ npm run test

> ggt@0.3.2 test
> cross-env NODE_OPTIONS="--loader @swc-node/register/esm --no-warnings" vitest

 RUN  v0.34.6 /Users/scott/Code/gadget/ggt

 ✓ spec/commands/sync.spec.ts (42) 11033ms
 ✓ spec/commands/sync.spec.ts (42) 11033ms
 ✓ spec/commands/root.spec.ts (25)
 ✓ spec/services/user.spec.ts (8)
 ✓ spec/commands/index.spec.ts (15)
 ✓ spec/services/version.spec.ts (6)
 ✓ spec/services/filesync.spec.ts (11)
 ✓ spec/commands/login.spec.ts (3)
 ✓ spec/services/args.spec.ts (16)
 ✓ spec/services/app.spec.ts (3)
 ✓ spec/services/config.spec.ts (8)
 ✓ spec/services/errors.spec.ts (8)
 ✓ spec/commands/logout.spec.ts (3)
 ✓ spec/services/session.spec.ts (5)
 ✓ spec/commands/whoami.spec.ts (3)
 ✓ spec/commands/list.spec.ts (2)

 Test Files  15 passed (15)
      Tests  155 passed | 3 skipped (158)
   Start at  10:23:19
   Duration  12.78s (transform 112ms, setup 645ms, collect 351ms, tests 11.32s, environment 0ms, prepare 55ms)
```

Tests also make use of the `tmp` directory. Every test gets its own directory in `tmp/spec/` to store temporary files. This means you can run tests in parallel without worrying about them interfering with each other.

<!-- TODO -->

<!-- ## Pull Requests -->

<!-- ## Releasing -->
