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
ggt v0.3.3

The command-line interface for Gadget

USAGE
  ggt [COMMAND]

COMMANDS
  sync           Sync your Gadget application's source code
  list           List your apps
  login          Log in to your account
  logout         Log out of your account
  whoami         Print the currently logged in account
  version        Print the version of ggt

FLAGS
  -h, --help     Print command's usage
  -v, --verbose  Print verbose output
      --json     Print output as JSON

For more information on a specific command, use 'ggt [COMMAND] --help'
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
  $ bin/dev.js whoami --verbose
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

- If you're working on file sync, you can `ggt sync` apps into the `tmp/apps` directory. This way, you can have your synced files and `ggt` code in the same directory without worrying about them interfering with each other.

## Testing

`ggt`'s tests live in the `spec` directory and are written using [Vitest](https://vitest.dev/). You can run them via `vitest`:

```shell-session
$ vitest

 RUN  v0.34.6 /Users/scott/Code/gadget/ggt

 ✓ spec/services/output/log/level.spec.ts (24)
 ✓ spec/commands/command.spec.ts (12)
 ✓ spec/services/output/log/printer.spec.ts (23)
 ✓ spec/services/filesync/directory.spec.ts (25) 398ms
 ✓ spec/services/output/update.spec.ts (6)
 ✓ spec/commands/root.spec.ts (24)
 ✓ spec/services/user/user.spec.ts (7)
 ✓ spec/commands/sync.spec.ts (13) 5448ms
 ✓ spec/services/filesync/filesync.spec.ts (26) 326ms
 ✓ spec/services/util/number.spec.ts (22)
 ✓ spec/commands/login.spec.ts (3)
 ✓ spec/services/app/app.spec.ts (2)
 ✓ spec/services/output/log/structured.spec.ts (8)
 ✓ spec/services/util/object.spec.ts (14)
 ✓ spec/services/error/error.spec.ts (9)
 ✓ spec/commands/logout.spec.ts (3)
 ✓ spec/services/util/function.spec.ts (6)
 ✓ spec/services/app/arg.spec.ts (8)
 ✓ spec/services/config/config.spec.ts (8)
 ✓ spec/services/user/session.spec.ts (4)
 ✓ spec/services/util/boolean.spec.ts (8)
 ✓ spec/commands/list.spec.ts (2)
 ✓ spec/commands/whoami.spec.ts (3)
 ✓ spec/commands/version.spec.ts (1)

 Test Files  24 passed (24)
      Tests  260 passed | 1 todo (261)
   Start at  20:45:41
   Duration  6.44s (transform 387ms, setup 5.42s, collect 1.77s, tests 7.27s, environment 2ms, prepare 1.57s)
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
