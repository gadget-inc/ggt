# Contributing to `ggt`

Contributions to `ggt` are welcomed from all! Contributors must adhere to the Code of Conduct for the ggt product, outlined in the [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) document.

## System dependencies

`ggt` uses Nix to manage system dependencies like `node` and `npm`. You don't need to use Nix to contribute to `ggt`, but it does make things easier!

If you don't use Nix, `ggt` needs the following system dependencies to develop:

- `node` >= v18
- `npm` >= v10
- `git` >= v2

### Gadget Staff

To develop against the Gadget development environment, you'll also need:

- `mkcert`

## Development

We use `pnpm` to manage dependencies and scripts. To install dependencies, run:

```shell
pnpm install
```

Once dependencies are installed, you can run `pnpm run dev` to build ggt into the `dist` directory and run tests in watch mode.

```shell
pnpm run dev
```

Once ggt is built, you can run it using `ggt`.

```shell-session
$ ggt
The command-line interface for Gadget.

Usage
  ggt [COMMAND]

Commands
  dev              Start developing your application
  deploy           Deploy your environment to production
  status           Show your local and environment's file changes
  push             Push your local files to your environment
  pull             Pull your environment's files to your local computer
  add              Add models, fields, actions and routes to your app
  open             Open a Gadget location in your browser
  list             List your available applications
  login            Log in to your account
  logout           Log out of your account
  whoami           Print the currently logged in account
  version          Print this version of ggt

Flags
  -h, --help       Print how to use a command
  -v, --verbose    Print more verbose output
      --telemetry  Enable telemetry

Run "ggt [COMMAND] -h" for more information about a specific command.
```

Running `ggt` runs `ggt` using the bundled code in the `dist` directory. You can verify this by running `which ggt` - it should point to a path in your nix store:

```shell-session
$ which ggt
/nix/store/.../bin/ggt
```

This is because `ggt` has been aliased in `flake.nix` to run the locally built version of `ggt` from the `dist` directory.

You can run `dggt` to run against the development version of Gadget used by Gadget staff. This is also aliased in `flake.nix` to run the locally built version of `ggt` from the `dist` directory and set the `GGT_ENV` environment variable to `"development"`.

```shell-session
$ dggt
The command-line interface for Gadget.

Usage
  ggt [COMMAND]

Commands
  dev              Start developing your application
  deploy           Deploy your environment to production
  status           Show your local and environment's file changes
  push             Push your local files to your environment
  pull             Pull your environment's files to your local computer
  add              Add models, fields, actions and routes to your app
  open             Open a Gadget location in your browser
  list             List your available applications
  login            Log in to your account
  logout           Log out of your account
  whoami           Print the currently logged in account
  version          Print this version of ggt

Flags
  -h, --help       Print how to use a command
  -v, --verbose    Print more verbose output
      --telemetry  Enable telemetry

Run "ggt [COMMAND] -h" for more information about a specific command.
```

### Environment Variables

`ggt` uses the following environment variables to configure its behavior:

- `GGT_ENV`
  - The environment to run `ggt` in.
  - Defaults to `"production"`.
  - If you're a Gadget staff member, you can set this to `"development"` to run against the development version of Gadget.
- `GGT_LOG_LEVEL`
  - The minimum log level to print to stderr.
  - Defaults to none, which means no logs are printed.
  - Valid values are `"trace"`, `"debug"`, `"info"`, `"warn"`, and `"error"`.
  - This is ignored if `--verbose` is passed.
    - `-v` = `"info"`
    - `-vv` = `"debug"`
    - `-vvv` = `"trace"`
- `GGT_LOG_FORMAT`
  - The format to use when printing logs.
  - Defaults to `"pretty"`.
  - Valid values are `"pretty"` and `"json"`.
  - This is ignored if `--json` is passed.
- `GGT_SESSION`
  - The session to use when sending requests to the Gadget API.
  - Defaults to the contents of `GGT_CONFIG_DIR/session.txt`.
- `GGT_GADGET_APP_DOMAIN`
  - The domain to use when sending requests to the Gadget API.
  - Defaults to `gadget.app` in production and `ggt.pub` in development.
- `GGT_GADGET_SERVICES_DOMAIN`
  - THe domain to use when sending requests to the Gadget Services API.
  - Defaults to `app.gadget.dev` in production and `app.ggt.dev` in development.
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
- `GGT_SENTRY_ENABLED`
  - Whether to enable Sentry error reporting.
  - Defaults to `"true"`.

### Tips

- If you want more verbose output from `ggt`, you can pass the `-v, --verbose` flag:

  ```shell-session
  $ ggt whoami --verbose
  08:37:09 INFO http: http request
    request:
      method: 'GET'
      url: 'https://app.gadget.dev/auth/api/current-user'
  08:37:09 INFO http: http response
    request:
      method: 'GET'
      url: 'https://app.gadget.dev/auth/api/current-user'
    response:
      statusCode: 200
      traceId: '5fa2f892c9af4481fac8e87e62763ea2'
      durationMs: 36
  08:37:09 INFO user: loaded current user
    user:
      id: 1
      name: 'Jane Doe'
      email: 'jane.doe@example.com'
  08:37:09 PRINT whoami:
    You are logged in as Jane Doe (jane.doe@example.com)
  ```

  If you want even more verbose output, you can pass the `-v, --verbose` flag multiple times. Each time you pass the flag, the log level is increased:

  - `-v` = `"info"`
  - `-vv` = `"debug"`
  - `-vvv` = `"trace"`

- If you're working on file sync, you can `ggt dev` apps into the `tmp/apps` directory. This way, you can have your synced files and `ggt` code in the same directory without worrying about them interfering with each other.

## Testing

`ggt`'s tests live in the `spec` directory and are written using [Vitest](https://vitest.dev/). You can run them via `vitest`:

```shell-session
$ pnpm run test

> ggt@1.4.2 test /Users/scott/Code/gadget/ggt
> vitest --cache


 RUN  v3.1.2 /Users/scott/Code/gadget/ggt

 ✓ spec/commands/login.spec.ts (3 tests) 20ms
 ✓ spec/services/output/update.spec.ts (7 tests) 67ms
 ✓ spec/services/filesync/hashes.spec.ts (10 tests) 72ms
 ✓ spec/services/filesync/directory.spec.ts (27 tests) 227ms
 ✓ spec/commands/open.spec.ts (8 tests) 252ms
 ✓ spec/commands/push.spec.ts (5 tests) 316ms
 ✓ spec/commands/pull.spec.ts (7 tests | 2 skipped) 319ms
 ✓ spec/services/output/log/format/pretty.spec.ts (7 tests) 25ms
 ✓ spec/services/filesync/error.spec.ts (14 tests) 42ms
 ✓ spec/commands/deploy.spec.ts (13 tests) 448ms
 ✓ spec/services/filesync/sync-json.spec.ts (30 tests) 527ms
 ✓ spec/services/output/print.spec.ts (14 tests) 36ms
 ✓ spec/commands/add.spec.ts (19 tests) 650ms
 ✓ spec/commands/root.spec.ts (54 tests) 213ms
 ✓ spec/services/util/object.spec.ts (14 tests) 27ms
 ✓ spec/services/user/user.spec.ts (7 tests) 64ms
 ✓ spec/services/util/function.spec.ts (6 tests) -114814663ms
   ✓ debounce > doesn't call the function when flush is called if the function hasn't been called yet  1000ms
 ✓ spec/commands/status.spec.ts (4 tests) 181ms
 ✓ spec/services/filesync/conflicts.spec.ts (2 tests) 29ms
 ✓ spec/services/filesync/changes.spec.ts (3 tests) 23ms
 ✓ spec/services/output/log/structured.spec.ts (11 tests | 1 skipped) 28ms
 ✓ spec/services/output/report.spec.ts (2 tests) 14ms
 ✓ spec/ggt.spec.ts (3 tests) 12ms
 ✓ spec/services/config/config.spec.ts (8 tests) 17ms
 ✓ spec/commands/list.spec.ts (3 tests) 56ms
 ✓ spec/services/command/context.spec.ts (4 tests) 15ms
 ✓ spec/services/command/arg.spec.ts (5 tests) 12ms
 ✓ spec/services/user/session.spec.ts (4 tests) 13ms
 ✓ spec/commands/whoami.spec.ts (3 tests) 14ms
 ✓ spec/services/output/log/level.spec.ts (24 tests) 36ms
 ✓ spec/services/util/number.spec.ts (22 tests) 25ms
 ✓ spec/commands/logout.spec.ts (3 tests) 13ms
 ✓ spec/services/util/json.spec.ts (3 tests) 13ms
 ✓ spec/services/app/app.spec.ts (2 tests) 25ms
 ✓ spec/services/app/arg.spec.ts (9 tests) 16ms
 ✓ spec/services/output/output.spec.ts (2 tests) 10ms
 ✓ spec/services/util/boolean.spec.ts (8 tests) 12ms
 ✓ spec/commands/version.spec.ts (1 test) 4ms
 ✓ spec/services/command/command.spec.ts (24 tests) 63ms
 ✓ spec/services/app/edit.spec.ts (9 tests) 3136ms
   ✓ Edit > retries queries when it receives a 500  3099ms
 ✓ spec/services/filesync/filesync.spec.ts (59 tests) 5060ms
   ✓ FileSync._sendChangesToEnvironment > retries failed graphql requests  3202ms
 ✓ spec/commands/dev.spec.ts (11 tests) 8699ms
   ✓ dev > writes changes from gadget to the local filesystem  752ms
   ✓ dev > sends changes from the local filesystem to gadget  3674ms
   ✓ dev > doesn't send multiple changes to the same file at once  530ms
   ✓ dev > doesn't send changes from the local filesystem to gadget if the file is ignored  2526ms
   ✓ dev > reloads the ignore file when .ignore changes  635ms

 Test Files  42 passed (42)
      Tests  471 passed | 1 skipped | 2 todo (474)
   Start at  18:33:20
   Duration  9.57s (transform 1.09s, setup 12.58s, collect 2.79s, tests 20.83s, environment 4ms, prepare 1.88s)
```

Tests also make use of the `tmp` directory. Every test gets its own directory in `tmp/spec/` to store temporary files. This means you can run tests in parallel without worrying about them interfering with each other.

## Pull Requests

To contribute to `ggt`, please open a pull request against the `main` branch. Pull requests must pass all tests and be reviewed by at least one other contributor before being merged.

Once your pull request is ready to be merged, you can add a description of the change along with the kind of change it is (major, minor, or patch) by performing the following steps:

> [!NOTE]
> If the changes don't warrant a new version (e.g. a documentation change), you can skip this step.

1. Click this button to add a new file that describes the change:

![CleanShot 2023-04-12 at 13 10 37@2x](https://user-images.githubusercontent.com/21965521/231532322-1e13919c-04b3-4604-83c2-4f1e4401b263.png)

2. Write a brief description of what this PR changes and click the Commit Changes button when you're done:

![CleanShot 2023-04-12 at 13 11 31@2x](https://user-images.githubusercontent.com/21965521/231532593-0d56146f-b8a5-4c77-8d9b-b138350cbd6b.png)

When we publish a new version, your description of the change will end up looking like this:

![CleanShot 2023-04-12 at 13 09 37@2x](https://user-images.githubusercontent.com/21965521/231532179-e5fc6174-06e4-43b0-8e4d-5b81efdac14b.png)

## Releasing

`ggt` uses [Changesets](https://github.com/changesets/changesets) and [Github Actions](https://github.com/features/actions) to publish new versions to NPM.

When there are changes to be published, a pull request named "Version Packages" will be opened. This pull request will contain a list of all the changesets that have been created since the last version was published.

To publish the changes, merge the "Version Packages" pull request to trigger the Github Action that publishes the new version to NPM and creates a new Github release.

### Experimental Releases

If you want to publish an experimental release, you can run the [`./scripts/publish-experimental.ts`](./scripts/publish-experimental.ts) script. This will publish a new version with the `experimental` tag to NPM. You can then install this version by running `npm install -g ggt@experimental`.
