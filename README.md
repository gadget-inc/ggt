<div align="center">
  <h1>ggt</h1>
  The command-line interface for <a href="https://gadget.dev">Gadget</a>

<br>
<br>

<a href="https://github.com/gadget-inc/ggt/actions/workflows/ci.yml?query=branch%3Amain">
  <img alt="ci workflow status" src="https://img.shields.io/github/actions/workflow/status/gadget-inc/ggt/ci.yml?branch=main&label=ci">
</a>
<a href="https://www.npmjs.com/package/ggt">
  <img alt="npm version" src="https://img.shields.io/npm/v/ggt">
</a>
<a href="https://discord.gg/nAfNKMdwKh">
  <img alt="discord chat" src="https://img.shields.io/discord/836317518595096598">
</a>

<br>
<br>

<i>Status: alpha -- please report any issues to the [issue tracker](https://github.com/gadget-inc/ggt/issues?q=is%3Aissue+is%3Aopen) here so we can fix them!</i>

</div>

## Table of Contents

- [Intro](#intro)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Commands](#commands)
  - [`ggt sync`](#ggt-sync)
  - [`ggt list`](#ggt-list)
  - [`ggt login`](#ggt-login)
  - [`ggt logout`](#ggt-logout)
  - [`ggt whoami`](#ggt-whoami)
  - [`ggt version`](#ggt-version)

## Intro

`ggt` is the command line interface for the Gadget platform, providing additional functionality for working with your Gadget applications using your existing tools on your machine. `ggt` isn't required for building end-to-end Gadget apps but supports syncing files locally (and more soon) for your preferred coding experience.

## Quick Start

Run the following to sync a `my-app.gadget.app` application to the `~/gadget/my-app` on your local machine:

```sh
npx ggt@latest sync ~/gadget/my-app --app=my-app
```

With this running in the background, your local `~/gadget/my-app` folder will become two-way synced with your application's filesystem in Gadget's cloud. Changes you make locally will be immediately reflected by your application's API and actions if you re-run them.

## Usage

```sh-session
$ npm install -g @gadgetinc/ggt
$ ggt
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

## Commands

### `ggt sync`

```sh-session
$ ggt sync --help
Sync your Gadget environment's source code with your local filesystem.

USAGE
  ggt sync [DIRECTORY]

ARGUMENTS
  DIRECTORY                  The directory to sync files to (default: ".")

FLAGS
  -a, --app=<name>           The Gadget application to sync files to
      --prefer=<filesystem>  Prefer "local" or "gadget" conflicting changes
      --once                 Sync once and exit
      --force                Sync regardless of local filesystem state

DESCRIPTION
  Sync allows you to synchronize your Gadget application's source
  code with your local filesystem.

  While ggt sync is running, local file changes are immediately
  reflected within Gadget, while files that are changed in Gadget are
  immediately saved to your local filesystem.

  Ideal for:
    • Local development with editors like VSCode
    • Storing source code in a Git repository like GitHub

  Sync looks for a ".ignore" file to exclude certain files/directories
  from being synced. The format is identical to Git's.

  These files are always ignored:
    • .DS_Store
    • .gadget
    • .git
    • node_modules

  Note:
    • Sync only works with your development environment
    • Avoid deleting/moving all your files while sync is running
    • Gadget only supports Yarn v1 for dependency installation

EXAMPLE
  $ ggt sync ~/gadget/example --app example

    App         example
    Editor      https://example.gadget.app/edit
    Playground  https://example.gadget.app/api/graphql/playground
    Docs        https://docs.gadget.dev/api/example

    Endpoints
      • https://example.gadget.app
      • https://example--development.gadget.app

    Watching for file changes... Press Ctrl+C to stop

    → Sent 09:06:25 AM
    routes/GET-hello.js  + created

    → Sent 09:06:49 AM
    routes/GET-hello.js  ± updated

    ← Received 09:06:54 AM
    routes/GET-hello.js  ± updated

    ← Received 09:06:56 AM
    routes/GET-hello.js  - deleted
    ^C Stopping... press Ctrl+C again to force

    Goodbye!
```

### `ggt list`

```sh-session
$ ggt list --help
List the apps available to the currently logged in user.

USAGE
  ggt list

EXAMPLE
  $ ggt list
    Slug    Domain
    ─────── ──────────────────
    my-app  my-app.gadget.app
    example example.gadget.app
    test    test.gadget.app
```

### `ggt login`

```sh-session
$ ggt login --help
Log in to your account.

USAGE
  ggt login

EXAMPLE
  $ ggt login
    We've opened Gadget's login page using your default browser.

    Please log in and then return to this terminal.

    Hello, Jane Doe (jane@example.com)
```

### `ggt logout`

```sh-session
$ ggt logout --help
Log out of your account.

USAGE
  ggt logout

EXAMPLE
  $ ggt logout
    Goodbye
```

### `ggt whoami`

```sh-session
$ ggt whoami --help
Show the name and email address of the currently logged in user

USAGE
  ggt whoami

EXAMPLE
  $ ggt whoami
    You are logged in as Jane Doe (jane@example.com)
```

### `ggt version`

```sh-session
$ ggt version --help
Print the version of ggt

USAGE
  ggt version

EXAMPLE
  $ ggt version
    0.4.7
```
