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
npx @gadgetinc/ggt sync --app my-app ~/gadget/my-app
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

- [`ggt sync [--app=<value>] [DIRECTORY]`](#ggt-sync---appvalue-directory)
- [`ggt help [COMMAND]`](#ggt-help-command)
- [`ggt login`](#ggt-login)
- [`ggt logout`](#ggt-logout)
- [`ggt whoami`](#ggt-whoami)

### `ggt sync [--app=<value>] [DIRECTORY]`

Sync your Gadget application's source code to and from your local filesystem.

```
USAGE
  $ ggt sync [--app=<value>] [DIRECTORY]

ARGUMENTS
  DIRECTORY  [default: .] The directory to sync files to. If the directory doesn't exist, it will be created.

FLAGS
  -a, --app=<value>  The Gadget application to sync files to.
  --force            Whether to sync even if we can't determine the state of your local files relative to your remote
                     ones.

DESCRIPTION
  Sync provides the ability to sync your Gadget application's source code to and from your local
  filesystem. While `ggt sync` is running, local file changes are immediately reflected within
  Gadget, while files that are changed remotely are immediately saved to your local filesystem.

  Use cases for this include:
    * Developing locally with your own editor like VSCode (https://code.visualstudio.com/)
    * Storing your source code in a Git repository like GitHub (https://github.com/)

  Sync includes the concept of a `.ignore` file. This file can contain a list of files and
  directories that won't be received or sent to Gadget when syncing.

  The following files and directories are always ignored:
    * .gadget
    * .git
    * node_modules

  Note:
    * Gadget applications only support installing dependencies with Yarn 1 (https://classic.yarnpkg.com/lang/en/).
    * Since file changes are immediately reflected in Gadget, avoid the following while `ggt sync` is running:
        * Deleting all your files
        * Moving all your files to a different directory

EXAMPLES
  $ ggt sync --app my-app ~/gadget/my-app
  Ready
  Received
  ← routes/GET.js
  ← user/signUp/signIn.js
  Sent
  → routes/GET.js
  ^C Stopping... (press Ctrl+C again to force)
  Done

  # These are equivalent

    $ ggt sync -a my-app
    $ ggt sync --app my-app
    $ ggt sync --app my-app.gadget.app
    $ ggt sync --app https://my-app.gadget.app
    $ ggt sync --app https://my-app.gadget.app/edit
```

_See code: [src/commands/sync.ts](https://github.com/gadget-inc/ggt/blob/v0.1.9/src/commands/sync.ts)_

### `ggt help [COMMAND]`

Display help for ggt.

```
USAGE
  $ ggt help [COMMAND]

ARGUMENTS
  COMMAND  The command to show help for.
```

_See code: [src/commands/help.ts](https://github.com/gadget-inc/ggt/blob/v0.1.9/src/commands/help.ts)_

### `ggt login`

Log in to your account.

```
USAGE
  $ ggt login

EXAMPLES
  $ ggt login
  Your browser has been opened. Please log in to your account.
  Hello, Jane Doe (jane@example.com)
```

_See code: [src/commands/login.ts](https://github.com/gadget-inc/ggt/blob/v0.1.9/src/commands/login.ts)_

### `ggt logout`

Log out of your account.

```
USAGE
  $ ggt logout

EXAMPLES
  $ ggt logout
  Goodbye
```

_See code: [src/commands/logout.ts](https://github.com/gadget-inc/ggt/blob/v0.1.9/src/commands/logout.ts)_

### `ggt whoami`

Show the name and email address of the currently logged in user.

```
USAGE
  $ ggt whoami

EXAMPLES
  $ ggt whoami
  You are logged in as Jane Doe (jane@example.com)
```

_See code: [src/commands/whoami.ts](https://github.com/gadget-inc/ggt/blob/v0.1.9/src/commands/whoami.ts)_

<!-- commandsstop -->

## Global Flags

### Debug

The `--debug` flag, shorthand `-D`, enables verbose output for debugging purposes.
