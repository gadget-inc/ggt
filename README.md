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

</div>

## Table of Contents

- [Intro](#intro)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Commands](#commands)
  - [`ggt dev`](#ggt-dev)
  - [`ggt deploy`](#ggt-deploy)
  - [`ggt status`](#ggt-status)
  - [`ggt push`](#ggt-push)
  - [`ggt pull`](#ggt-pull)
  - [`ggt open`](#ggt-open)
  - [`ggt list`](#ggt-list)
  - [`ggt login`](#ggt-login)
  - [`ggt logout`](#ggt-logout)
  - [`ggt whoami`](#ggt-whoami)
  - [`ggt version`](#ggt-version)

## Intro

`ggt` is the command line interface for the Gadget platform, providing additional functionality for working with your Gadget applications using your existing tools on your machine.

## Quick Start

Assuming you have a Gadget application named `example`, run the following to clone your application's source code to `~/gadget/example` to begin developing:

```sh
npx ggt@latest dev ~/gadget/example --app=example
```

While `ggt dev` is running, `~/gadget/example` will synchronized with your application's filesystem in Gadget's cloud. Any file changes you make locally will be immediately reflected by your application's API and actions if you re-run them.

## Usage

```sh-session
$ npm install -g ggt
$ ggt
The command-line interface for Gadget.

USAGE
  ggt [COMMAND]

COMMANDS
  dev              Start developing your application
  deploy           Deploy your environment to production
  status           Show your local and environment's file changes
  push             Push your local files to your environment
  pull             Pull your environment's files to your local computer
  open             Open a Gadget location in your browser
  list             List your available applications
  login            Log in to your account
  logout           Log out of your account
  whoami           Print the currently logged in account
  version          Print this version of ggt

FLAGS
  -h, --help       Print how to use a command
  -v, --verbose    Print more verbose output
      --telemetry  Enable telemetry

Run "ggt [COMMAND] -h" for more information about a specific command.
```

## Commands

### `ggt dev`

```sh-session
$ ggt dev -h
Develop your app by synchronizing your local files with your
environment's files, in real-time. Changes are tracked from
the last "ggt dev", "ggt push", or "ggt pull" run locally.

USAGE
  ggt dev [DIRECTORY]

EXAMPLES
  $ ggt dev
  $ ggt dev ~/gadget/example
  $ ggt dev ~/gadget/example
  $ ggt dev ~/gadget/example --app=example
  $ ggt dev ~/gadget/example --app=example --env=development --prefer=local

ARGUMENTS
  DIRECTORY    The directory to synchronize files to (default: ".")

FLAGS
  -a, --app=<name>           The application to synchronize files with
  -e, --env=<name>           The environment to synchronize files with
      --prefer=<filesystem>  Prefer "local" or "environment" conflicting changes

  Run "ggt dev --help" for more information.
```

### `ggt deploy`

```sh-session
$ ggt deploy -h
Deploy an environment to production.

Your local files must match your environment's files
before you can deploy. Changes are tracked from
the last "ggt dev", "ggt push", or "ggt pull" run locally.

USAGE
  ggt deploy

EXAMPLES
  $ ggt deploy
  $ ggt deploy --from=staging
  $ ggt deploy --from=staging --force
  $ ggt deploy --from=staging --force --allow-problems

FLAGS
  -a, --app=<name>      The application to deploy
  -e, --from=<env>      The environment to deploy from
      --force           Discard changes to your environment's filesystem
      --allow-problems  Deploy regardless of any problems the environment has
      --allow-charges   Deploy even if doing so will add charges to your account

Run "ggt deploy --help" for more information.
```

### `ggt status`

```sh-session
$ ggt status -h
Show file changes since your last dev, push, or pull.

USAGE

  ggt status

EXAMPLES

  $ ggt status
```

### `ggt push`

```sh-session
$ ggt push -h
Push your local files to your environment's filesystem.
Changes are tracked from the last "ggt dev", "ggt push", or
"ggt pull" run locally.

USAGE
  ggt push

EXAMPLES
  $ ggt push
  $ ggt push --env=staging
  $ ggt push --env=staging --force

FLAGS
  -a, --app=<name>   The application to push files to
  -e, --env=<name>   The environment to push files to
      --force        Discard changes to your environment's filesystem

  Run "ggt push --help" for more information.
```

### `ggt pull`

```sh-session
$ ggt pull -h
Pull your environment's files to your local filesystem.
Changes are tracked from the last "ggt dev", "ggt push", or
"ggt pull" run locally.

USAGE
  ggt pull

EXAMPLES
  $ ggt pull
  $ ggt pull --env=staging
  $ ggt pull --env=staging --force

FLAGS
  -a, --app=<name>   The application to pull files from
  -e, --env=<name>   The environment to pull files from
      --force        Discard changes to your local filesystem

  Run "ggt pull --help" for more information.
```

### `ggt open`

```sh-session
$ ggt open -h
Open a Gadget location in your browser.

USAGE
  ggt open [LOCATION] [MODEL]

EXAMPLES
  $ ggt open
  $ ggt open logs
  $ ggt open permissions
  $ ggt open data modelA
  $ ggt open schema modelA
  $ ggt open data --show-all
  $ ggt open schema --show-all

ARGUMENTS
  LOCATION    The location to open
  MODEL       The model to open

FLAGS
  -a, --app=<name>      The application to open
  -e, --env=<env>       The environment to open
      --show-all        Show all available models to open

Run "ggt open --help" for more information.
```

### `ggt list`

```sh-session
$ ggt list -h
List your available applications.

USAGE
  ggt list

EXAMPLES
  $ ggt list
```

### `ggt login`

```sh-session
$ ggt login -h
Log in to your account.

USAGE
  ggt login

EXAMPLES
  $ ggt login
```

### `ggt logout`

```sh-session
$ ggt logout -h
Log out of your account.

USAGE
  ggt logout

EXAMPLES
  $ ggt logout
```

### `ggt whoami`

```sh-session
$ ggt whoami -h
Show the name and email address of the currently logged in user.

USAGE
  ggt whoami

EXAMPLES
  $ ggt whoami
```

### `ggt version`

```sh-session
$ ggt version -h
Print this version of ggt.

USAGE
  ggt version

EXAMPLES
  $ ggt version
```
