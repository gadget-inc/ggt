<div align="center">
  <h1>ggt</h1>
  The command-line interface for <a href="https://gadget.dev">Gadget</a>

<br>
<br>

<a href="https://github.com/gadget-inc/ggt/actions/workflows/ci.yml?query=branch%3Amain">
  <img alt="ci workflow status" src="https://img.shields.io/github/actions/workflow/status/gadget-inc/ggt/ci.yml?branch=main&label=ci">
</a>
<a href="https://www.npmjs.com/package/@gadgetinc/ggt">
  <img alt="npm version" src="https://img.shields.io/npm/v/@gadgetinc/ggt">
</a>
<a href="https://discord.gg/nAfNKMdwKh">
  <img alt="discord chat" src="https://img.shields.io/discord/836317518595096598">
</a>

<br>
<br>

<i>Status: alpha -- please report any issues to the [issue tracker](https://github.com/gadget-inc/ggt/issues?q=is%3Aissue+is%3Aopen) here so we can fix them!</i>

</div>

## Intro

`ggt` is the command line interface for the Gadget platform, providing additional functionality for working with your Gadget applications using your existing tools on your machine. `ggt` isn't required for building end-to-end Gadget apps but supports syncing files locally (and more soon) for your preferred coding experience.

## Quick Start

Run the following to sync a `my-app.gadget.app` application to the `~/gadget/my-app` on your local machine:

```sh
npx @gadgetinc/ggt@latest sync --app my-app ~/gadget/my-app
```

With this running in the background, your local `~/gadget/my-app` folder will become two-way synced with your application's filesystem in Gadget's cloud. Changes you make locally will be immediately reflected by your application's API and actions if you re-run them.

## Usage

```sh-session
$ npm install -g @gadgetinc/ggt
$ ggt COMMAND
running command...
$ ggt --version
@gadgetinc/ggt/0.0.0 darwin-arm64 node-v18.0.0
$ ggt help [COMMAND]
USAGE
  $ ggt COMMAND
...
```

## Commands

  <!-- commands -->

- [`ggt sync [DIRECTORY] [--app <name>]`](#ggt-sync-directory---app-name)
- [`ggt help [COMMAND]`](#ggt-help-command)
- [`ggt list`](#ggt-list)
- [`ggt login`](#ggt-login)
- [`ggt logout`](#ggt-logout)
- [`ggt whoami`](#ggt-whoami)

### `ggt sync [DIRECTORY] [--app <name>]`

Sync your Gadget application's source code to and from your local filesystem.

```
USAGE
  $ ggt sync [DIRECTORY] [--app <name>]

ARGUMENTS
  DIRECTORY  [default: .] The directory to sync files to. If the directory doesn't exist, it will be created.

FLAGS
  -a, --app=<name>  The Gadget application to sync files to.
  --force           Whether to sync even if we can't determine the state of your local files relative to your remote
                    ones.

DESCRIPTION
  Sync provides the ability to sync your Gadget application's source code to and from your local
  filesystem. While ggt sync is running, local file changes are immediately reflected within
  Gadget, while files that are changed remotely are immediately saved to your local filesystem.

  Use cases for this include:
    - Developing locally with your own editor like VSCode (https://code.visualstudio.com/)
    - Storing your source code in a Git repository like GitHub (https://github.com/)

  Sync includes the concept of a .ignore file. This file may contain a list of files and
  directories that won't be received or sent to Gadget when syncing. The format of this file is
  identical to the one used by Git (https://git-scm.com/docs/gitignore).

  The following files and directories are always ignored:
    - .gadget
    - .git
    - node_modules
    - .DS_Store

  Note:
    - If you have separate development and production environments, ggt sync will only sync with your development environment
    - Gadget applications only support installing dependencies with Yarn 1 (https://classic.yarnpkg.com/lang/en/)
    - Since file changes are immediately reflected in Gadget, avoid the following while ggt sync is running:
        - Deleting all your files
        - Moving all your files to a different directory

EXAMPLES
  $ ggt sync --app my-app ~/gadget/my-app

  App         my-app
  Editor      https://my-app.gadget.app/edit
  Playground  https://my-app.gadget.app/api/graphql/playground
  Docs        https://docs.gadget.dev/api/my-app

  Endpoints
    - https://my-app.gadget.app
    - https://my-app--development.gadget.app

  Watching for file changes... Press Ctrl+C to stop

  Received 12:00:00 PM
  ← routes/GET.js (changed)
  ← user/signUp/signIn.js (changed)
  2 files in total. 2 changed, 0 deleted.

  Sent 12:00:03 PM
  → routes/GET.ts (changed)
  1 file in total. 1 changed, 0 deleted.

  ^C Stopping... (press Ctrl+C again to force)
  Goodbye!
```

_See code: [src/commands/sync.ts](https://github.com/gadget-inc/ggt/blob/v0.2.4/src/commands/sync.ts)_

### `ggt help [COMMAND]`

Display help for ggt.

```
USAGE
  $ ggt help [COMMAND]

ARGUMENTS
  COMMAND  The command to show help for.
```

_See code: [src/commands/help.ts](https://github.com/gadget-inc/ggt/blob/v0.2.4/src/commands/help.ts)_

### `ggt list`

List the apps available to the currently logged in user.

```
USAGE
  $ ggt list

FLAGS
  -x, --extended     show extra columns
  --columns=<value>  only show provided columns (comma-separated)
  --csv              output is csv format [alias: --output=csv]
  --filter=<value>   filter property by partial string matching, ex: name=foo
  --no-header        hide table header from output
  --no-truncate      do not truncate output to fit screen
  --output=<option>  output in a more machine friendly format
                     <options: csv|json|yaml>
  --sort=<value>     property to sort by (prepend '-' for descending)

EXAMPLES
  $ ggt list
  $ ggt list --extended
  $ ggt list --sort=slug
```

_See code: [src/commands/list.ts](https://github.com/gadget-inc/ggt/blob/v0.2.4/src/commands/list.ts)_

### `ggt login`

Log in to your account.

```
USAGE
  $ ggt login

EXAMPLES
  $ ggt login
  We've opened Gadget's login page using your default browser.

  Please log in and then return to this terminal.

  Hello, Jane Doe (jane@example.com)
```

_See code: [src/commands/login.ts](https://github.com/gadget-inc/ggt/blob/v0.2.4/src/commands/login.ts)_

### `ggt logout`

Log out of your account.

```
USAGE
  $ ggt logout

EXAMPLES
  $ ggt logout
  Goodbye
```

_See code: [src/commands/logout.ts](https://github.com/gadget-inc/ggt/blob/v0.2.4/src/commands/logout.ts)_

### `ggt whoami`

Show the name and email address of the currently logged in user.

```
USAGE
  $ ggt whoami

EXAMPLES
  $ ggt whoami
  You are logged in as Jane Doe (jane@example.com)
```

_See code: [src/commands/whoami.ts](https://github.com/gadget-inc/ggt/blob/v0.2.4/src/commands/whoami.ts)_

<!-- commandsstop -->

## Global Flags

### Debug

The `--debug` flag, shorthand `-D`, enables verbose output for debugging purposes.
