<div align="center">
  <h1>ggt</h1>
  The command-line interface for <a href="https://gadget.dev">Gadget</a>

  <br>
  <br>

<i>Status: alpha -- please report any issues to the [issue tracker](https://github.com/gadget-inc/ggt/issues?q=is%3Aissue+is%3Aopen) here so we can fix them!</i>

</div>

## Intro

`ggt` is the command line interface for the Gadget platform, providing additional functionality for working with your Gadget applications using your existing tools on your machine. `ggt` isn't required for building end-to-end Gadget apps but supports syncing files locally (and more soon) for your preferred coding experience.

## Quick Start

```sh
npx @gadgetinc/ggt sync --app my-app ~/gadget/my-app
```

## Usage

```sh-session
$ npm install -g @gadgetinc/ggt
$ ggt COMMAND
running command...
$ ggt --version
@gadgetinc/ggt/0.0.0 darwin-arm64 node-v18.0.0
$ ggt --help [COMMAND]
USAGE
  $ ggt COMMAND
...
```

## Commands

  <!-- commands -->

- [`ggt sync --app <name> [DIRECTORY]`](#ggt-sync---app-name-directory)
- [`ggt help [COMMAND]`](#ggt-help-command)
- [`ggt login`](#ggt-login)
- [`ggt logout`](#ggt-logout)
- [`ggt whoami`](#ggt-whoami)

### `ggt sync --app <name> [DIRECTORY]`

Sync your Gadget application's source code to and from your local filesystem.

```
USAGE
  $ ggt sync --app <name> [DIRECTORY]

ARGUMENTS
  DIRECTORY  [default: .] The directory to sync files to. If the directory doesn't exist, it will be created.

FILE FLAGS
  --file-poll-interval=ms        [default: 100] Interval in milliseconds between polling a file's size.
  --file-push-delay=ms           [default: 100] Delay in milliseconds before pushing files to your app.
  --file-stability-threshold=ms  [default: 500] Time in milliseconds a file's size must remain the same.

DESCRIPTION
  Sync provides the ability to sync your Gadget application's source code to and from your local
  filesystem. While `ggt sync` is running, local file changes are immediately reflected within
  Gadget, while files that are changed remotely are immediately saved to your local filesystem.

  Use cases for this include:
    * Developing locally with your own editor like VSCode (https://code.visualstudio.com/)
    * Storing your source code in a Git repository like GitHub (https://github.com/)

  Sync includes the concept of a `.ignore` file. This file can contain a list of files and
  directories that won't be sent to Gadget when syncing.

  The following files and directories are always ignored:
    * .gadget
    * .ggt
    * .git
    * node_modules

  Note:
    * Sync does not support node_modules, so you will have to run `npm install` yourself.
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

    $ ggt sync -A my-app
    $ ggt sync --app my-app
    $ ggt sync --app my-app.gadget.app
    $ ggt sync --app https://my-app.gadget.app
    $ ggt sync --app https://my-app.gadget.app/edit
```

_See code: [src/commands/sync.ts](https://github.com/gadget-inc/ggt/blob/v0.0.0/src/commands/sync.ts)_

### `ggt help [COMMAND]`

Display help for ggt.

```
USAGE
  $ ggt help [COMMAND] [-n]

ARGUMENTS
  COMMAND  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for ggt.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v5.1.12/src/commands/help.ts)_

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

_See code: [src/commands/login.ts](https://github.com/gadget-inc/ggt/blob/v0.0.0/src/commands/login.ts)_

### `ggt logout`

Log out of your account.

```
USAGE
  $ ggt logout

EXAMPLES
  $ ggt logout
  Goodbye
```

_See code: [src/commands/logout.ts](https://github.com/gadget-inc/ggt/blob/v0.0.0/src/commands/logout.ts)_

### `ggt whoami`

Show the name and email address of the currently logged in user.

```
USAGE
  $ ggt whoami

EXAMPLES
  $ ggt whoami
  You are logged in as Jane Doe (jane@example.com)
```

_See code: [src/commands/whoami.ts](https://github.com/gadget-inc/ggt/blob/v0.0.0/src/commands/whoami.ts)_

<!-- commandsstop -->

## Global Flags

### App

The `--app` flag, shorthand `-A`, specifies the Gadget application the command applies to.

### Debug

The `--debug` flag, shorthand `-D`, enables verbose output for debugging purposes.
