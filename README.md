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
  - [`ggt add`](#ggt-add)
  - [`ggt open`](#ggt-open)
  - [`ggt list`](#ggt-list)
  - [`ggt login`](#ggt-login)
  - [`ggt logout`](#ggt-logout)
  - [`ggt logs`](#ggt-logs)
  - [`ggt whoami`](#ggt-whoami)
  - [`ggt configure`](#ggt-configure)
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
  logs             Stream your environment's logs
  whoami           Print the currently logged in account
  configure        Configure default execution options
  version          Print this version of ggt

Flags
  -h, --help       Print how to use a command
  -v, --verbose    Print more verbose output
      --telemetry  Enable telemetry

Run "ggt [COMMAND] -h" for more information about a specific command.
```

## Commands

### `ggt dev`

```sh-session
$ ggt dev -h
Clones your Gadget environment's files to your local machine and keeps it in sync, in order to
enable local development with your text editor and source code with Git.

If your app's local directory already exists, this command first performs a sync to ensure
that your local and environment directories match, changes are tracked since last sync. If any
conflicts are detected, they must be resolved before development starts.

Usage
      $ ggt dev [DIRECTORY] [options]

      DIRECTORY: The directory to sync files to (default: the current directory)

Options
      -a, --app <app_name>        Selects the app to sync files with. Default set on ".gadget/sync.json"
      -e, --env <env_name>        Selects the environment to sync files with. Default set on ".gadget/sync.json"
      --prefer <source>           Auto-select changes from 'local' or 'environment' source on conflict
      --allow-unknown-directory   Syncs to any local directory with existing files, even if the ".gadget/sync.json" file is missing
      --allow-different-app       Syncs with a different app using the --app command, instead of the one specified in the .gadget/sync.json file
      --log-level <level>         Sets the log level for incoming application logs (default: info)
      --no-logs                   Disables outputting application logs to the console
      --my-logs                   Only outputs user sourced logs

Ignoring files
      ggt dev uses a .ignore file, similar to .gitignore, to exclude specific files and
      folders from syncing. These files are always ignored:

      • .DS_Store
      • .gadget
      • .git
      • node_modules
      • .shopify

Notes
      • "ggt dev" only works with development environments
      • "ggt dev" only supports "yarn" v1 for installing dependencies
      • Avoid deleting or moving all of your files while "ggt dev" is running

Examples
      sync an app in a custom path
      $ ggt dev ~/myGadgetApps/myBlog --app myBlogApp

      sync with a specific environment and preselect all local changes on conflicts
      $ ggt dev --env main --prefer local

      sync a custom path with a specific app, environment and preselect all changes from local on conflicts
      $ ggt dev ~/gadget/example --app=example --env=development --prefer=local
```

### `ggt deploy`

```sh-session
$ ggt deploy -h
Deploys your app to production.

This command first performs a sync to ensure that your local and environment directories
match, changes are tracked since last sync. If any conflicts are detected, they must be
resolved before deployment.

Usage
      $ ggt deploy [options]

Options
      -a, --app <app_name>           Selects a specific app to deploy. Default set on ".gadget/sync.json"
      --from, -e, --env <env_name>   Selects a specific environment to sync and deploy from. Default set on ".gadget/sync.json"
      --force                        Deploys by discarding any changes made to the environment directory since last sync
      --allow-different-directory    Deploys from any local directory with existing files, even if the ".gadget/sync.json" file is missing
      --allow-different-app          Deploys a different app using the --app command, instead of the one specified in the “.gadget/sync.json” file
      --allow-problems               Deploys despite any existing issues found in the app (gelly errors, typescript errors etc.)
      --allow-data-delete            Deploys even if it results in the deletion of data in production
      --allow-charges                Deploys even if it results in additional charges to your plan

Examples
      Deploys code from the staging environment of a myBlog
      $ ggt deploy -a myBlog -from staging
```

### `ggt status`

```sh-session
$ ggt status -h
Shows file changes since last sync (e.g. $ggt dev, push, deploy etc.)

Usage
      ggt status
```

### `ggt push`

```sh-session
$ ggt push -h
Pushes your local files to your environment directory.

This command first tracks changes in your environment directory since the last sync.
If changes are detected, you will be prompted to discard them or abort the push.

Usage
      ggt push [options]

Options
      -a, --app <app_name>           Selects the app to push local changes to. Default set on ".gadget/sync.json"
      -e, --env, --to <env_name>     Selects the environment to push local changes to. Default set on ".gadget/sync.json"
      --force                        Forces a push by discarding any changes made on your environment directory since last sync
      --allow-different-directory    Pushes changes from any local directory with existing files, even if the ".gadget/sync.json" file is missing
      --allow-different-app          Pushes changes to an app using --app command, instead of the one in the “.gadget/sync.json” file

Examples
      Push all local changes to the main environment by discarding any changes made on main
      $ ggt push --env main --force
```

### `ggt pull`

```sh-session
$ ggt pull -h
Pulls your environment files to your local directory.

This command first tracks changes in your local directory since the last sync. If changes are
detected, you will be prompted to discard them or abort the pull.

Usage
      ggt pull [options]

Options
      -a, --app <app_name>           Selects the app to pull your environment changes from. Default set on ".gadget/sync.json"
      -e, --env, --from <env_name>   Selects the environment to pull changes from. Default set on ".gadget/sync.json"
      --force                        Forces a pull by discarding any changes made on your local directory since last sync
      --allow-different-directory    Pulls changes from any environment directory, even if the ".gadget/sync.json" file is missing
      --allow-different-app          Pulls changes to a different app using --app command, instead of the one in the “.gadget/sync.json” file

Examples
      Pull all development environment changes by discarding any changes made locally
      $ ggt pull --env development --force
```

### `ggt add`

```sh-session
$ ggt add -h
Adds models, fields, actions and routes to your app.

This command first performs a sync to ensure that your local and environment directories match, changes are tracked since last sync.
If any conflicts are detected, they must be resolved before adding models, fields, actions or routes.

Usage
  ggt add model <model_name> [field_name:field_type ...]

  ggt add action [CONTEXT]/<action_name>
  CONTEXT:Specifies the kind of action. Use "model" for model actions otherwise use "action".

  ggt add route <HTTP_METHOD> <route_path>

  ggt add field <model_path>/<field_name>:<field_type>

Options
  -e, --env <env_name> Selects the environment to add to. Default set on ".gadget/sync.json"

Examples
  Add a new model 'post' with out fields:
  $ ggt add model modelA

  Add a new model 'post' with 2 new 'string' type fields 'title' and 'body':
  $ ggt add model post title:string body:string

  Add a new 'boolean' type field 'published' to an existing model
  ggt add field post/published:boolean

  Add new action 'publish' to the 'post' model:
  ggt add action model/post/publish

  Add a new action 'audit'
  ggt add action action/audit

  Add a new route 'howdy'
  ggt add route GET howdy

  Clone the `development` environment into a new `staging` environment
  ggt add environment staging --environment development
```

### `ggt open`

```sh-session
$ ggt open -h
This command opens a specific Gadget page in your browser, allowing you to directly access
various parts of your application's interface such as logs, permissions, data views, or
schemas.

Usage
      ggt open [LOCATION] [model_name] [--show-all] [options]

      LOCATION: specifies the part of Gadget to open, by default it'll open the apps home page:

      + logs                Opens logs
      + permissions         Opens permissions
      + data                Opens data editor for a specific model
      + schema              Opens schema editor for a specific model

Options
      -a, --app <app_name>   Selects the application to open in your browser. Default set on ".gadget/sync.json"
      -e, --env <env_name>   Selects the environment to open in your browser. Default set on ".gadget/sync.json"
      --show-all             Shows all schema, or data options by listing your available models

Examples
      Opens editor home
      $ ggt open

      Opens logs
      $ ggt open logs

      Opens permissions
      $ ggt open permissions

      Opens data editor for the 'post' model
      $ ggt open data post

      Opens schema for 'post' model
      $ ggt open schema post

      Shows all models available in the data editor
      $ ggt open data -show-all

      Shows all models available in the schema viewer
      $ ggt open schema --show-all

      Opens data editor for 'post' model of app 'myBlog' in the 'staging' environment
      $ ggt open data post --app myBlog --env staging
```

### `ggt list`

```sh-session
$ ggt list -h
List the apps available to the currently logged-in user.

Usage
      ggt list
```

### `ggt login`

```sh-session
$ ggt login -h
Log in to your account.

Usage
      ggt login
```

### `ggt logout`

```sh-session
$ ggt logout -h
Log out of your account.

Usage
      ggt logout
```

### `ggt logs`

```sh-session
$ ggt logs -h
Streams the logs for an application to.

Usage
      ggt logs [options]

Options
      -ll, --log-level <level>       Sets the log level for incoming application logs (default: info)
      --my-logs                      Only outputs user sourced logs and exclude logs from the Gadget framework
      --json                         Output logs in JSON format
      -a, --app <app_name>           Selects the app to pull your environment changes from. Default set on ".gadget/sync.json"
      -e, --env, --from <env_name>   Selects the environment to pull changes from. Default set on ".gadget/sync.json"

Examples
      Stream all user logs from your development environment
      $ ggt logs --env development --my-logs

      Stream all logs from your production environment in JSON format
      $ ggt logs --env production --json
```

### `ggt whoami`

```sh-session
$ ggt whoami -h
Show the name and email address of the currently logged in user.

Usage
      ggt whoami
```

### `ggt configure`

```sh-session
$ ggt configure -h
Make changes to the configured defaults. This allows you to set an option on every ggt command by default without
needing to set a flag on every command.

Usage
  ggt configure show

  ggt configure change

  ggt configure clear
```

### `ggt version`

```sh-session
$ ggt version -h
Print this version of ggt.

Usage
      ggt version

Updating ggt
      When there is a new release of ggt, running ggt will show you a message letting you
      know that an update is available.
```
