<div align="center">
  <h1>ggt</h1>
  The command-line interface for <a href="https://gadget.dev">Gadget</a>
</div>

# Commands

  <!-- commands -->

- [`ggt help [COMMAND]`](#ggt-help-command)
- [`ggt login`](#ggt-login)
- [`ggt logout`](#ggt-logout)
- [`ggt sync --app <name> [DIRECTORY]`](#ggt-sync---app-name-directory)
- [`ggt whoami`](#ggt-whoami)

## `ggt help [COMMAND]`

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

## `ggt login`

Log in to your account.

```
USAGE
  $ ggt login

EXAMPLES
  $ ggt login
  Your browser has been opened. Please log in to your account.
  👋 Hello, Jane Doe (jane@example.com)
```

_See code: [dist/commands/login.ts](gadget-inc/ggt)_

## `ggt logout`

Log out of your account.

```
USAGE
  $ ggt logout

EXAMPLES
  $ ggt logout
  👋 Goodbye
```

_See code: [dist/commands/logout.ts](gadget-inc/ggt)_

## `ggt sync --app <name> [DIRECTORY]`

Sync your Gadget app's source files to your local file system.

```
USAGE
  $ ggt sync --app <name> [DIRECTORY]

ARGUMENTS
  DIRECTORY  [default: .] The directory to sync files to. If the directory doesn't exist, it will be created.

FILE FLAGS
  --file-poll-interval=ms        [default: 100] Interval in milliseconds between polling a file's size.
  --file-push-delay=ms           [default: 100] Delay in milliseconds before pushing files to your app.
  --file-stability-threshold=ms  [default: 500] Time in milliseconds a file's size must remain the same.

EXAMPLES
  $ ggt sync --app my-app ~/gadget/my-app
  👀 set up local file watcher
  📡 set up remote file subscription
  ✍️  wrote remote file changes
      total: 1
      files:
        - routes/GET.js
  🚀 sent local file changes
      total: 1
      files:
        - routes/GET-ping.ts


  # These are equivalent

    $ ggt sync --app my-app
    $ ggt sync --app my-app.gadget.app
    $ ggt sync --app https://my-app.gadget.app
```

_See code: [dist/commands/sync.ts](gadget-inc/ggt)_

## `ggt whoami`

Show the name and email address of the currently logged in user.

```
USAGE
  $ ggt whoami

EXAMPLES
  $ ggt whoami
  You are logged in as Jane Doe (jane@example.com)
```

_See code: [dist/commands/whoami.ts](gadget-inc/ggt)_

<!-- commandsstop -->
