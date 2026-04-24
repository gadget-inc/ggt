<div align="center">
  <h1>ggt</h1>
  The command-line interface for <a href="https://gadget.dev">Gadget</a>

<br>
<br>

[![ci/cd workflow status](https://github.com/gadget-inc/ggt/actions/workflows/cd.yml/badge.svg)](https://github.com/gadget-inc/ggt/actions/workflows/cd.yml)
[![npm version](https://img.shields.io/npm/v/ggt)](https://www.npmjs.com/package/ggt)
[![discord server](https://img.shields.io/discord/836317518595096598)](https://discord.gg/9d7wjGBZ6M)

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
  - [`ggt problems`](#ggt-problems)
  - [`ggt push`](#ggt-push)
  - [`ggt pull`](#ggt-pull)
  - [`ggt var`](#ggt-var)
  - [`ggt env`](#ggt-env)
  - [`ggt add`](#ggt-add)
  - [`ggt model`](#ggt-model)
  - [`ggt action`](#ggt-action)
  - [`ggt field`](#ggt-field)
  - [`ggt shopify`](#ggt-shopify)
  - [`ggt open`](#ggt-open)
  - [`ggt list`](#ggt-list)
  - [`ggt login`](#ggt-login)
  - [`ggt logout`](#ggt-logout)
  - [`ggt logs`](#ggt-logs)
  - [`ggt debugger`](#ggt-debugger)
  - [`ggt whoami`](#ggt-whoami)
  - [`ggt configure`](#ggt-configure)
  - [`ggt agent-plugin`](#ggt-agent-plugin)
  - [`ggt eval`](#ggt-eval)
  - [`ggt version`](#ggt-version)
  - [`ggt completion`](#ggt-completion)

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
  ggt [command]

COMMANDS
  Development
  dev             Sync files and stream logs locally
  deploy          Deploy an environment to production
  push            Upload local file changes to Gadget
  pull            Download environment files to your local directory
  status          Show sync state and pending file changes
  logs            Print recent logs or stream logs from your app
  debugger        Connect a debugger to your app's environment

  Resources
  add             Add resources to your app
  model           Add and manage models in your app
  action          Add and manage actions
  field           Manage fields on your models
  shopify         Manage Shopify connection
  var             Manage your app's environment variables
  env             Manage your app's environments
  open            Open your app in a browser

  Account
  login           Log in to Gadget
  logout          Log out of Gadget
  whoami          Show the current logged-in user
  list            List your Gadget apps

  Diagnostics
  problems        Show errors and warnings in your app
  eval            Evaluate a JavaScript snippet against your app

  Configuration
  configure       Manage ggt configuration
  agent-plugin    Manage plugins for AI coding assistants
  completion      Generate shell completion scripts
  version         Print the currently installed version

FLAGS
  -h, --help       Show command help
      --version    Print the ggt version
  -v, --verbose    Increase output verbosity (-vv for debug, -vvv for trace)
      --telemetry  Enable telemetry
      --json       Output as JSON where supported

Use -h for a summary, --help for full details.

Documentation: https://docs.gadget.dev/guides/cli
Issues:        https://github.com/gadget-inc/ggt/issues
```

## Commands

### `ggt dev`

```sh-session
$ ggt dev -h
Sync files and stream logs locally

USAGE
  ggt dev [directory] [flags]

ARGUMENTS
  directory    Directory to sync files to

FLAGS
  -a, --app, --application <app>  Gadget app to use
  -e, --env, --environment <env>  Environment to use
  -l, --log-level <level>         Minimum log level to display
  -m, --my-logs                   Show only logs emitted by your code
      --no-logs                   Don't stream logs while syncing
      --prefer <source>           Auto-resolve conflicts using the given source

EXAMPLES
  $ ggt dev
  $ ggt dev ~/gadget/my-app
  $ ggt dev --prefer local
  $ ggt dev ~/gadget/my-app --app my-app --env development --prefer local
```

### `ggt deploy`

```sh-session
$ ggt deploy -h
Deploy an environment to production

USAGE
  ggt deploy [flags]

FLAGS
  -a, --app, --application <app>          Gadget app to use
  -e, --env, --environment, --from <env>  Environment to deploy from
  -f, --force                             Skip the push confirmation prompt

EXAMPLES
  $ ggt deploy
  $ ggt deploy --env staging
  $ ggt deploy --force --allow-all
  $ ggt deploy --force --allow=problems,charges,data-delete
  $ ggt deploy --env staging --force --allow-problems --allow-charges --allow-data-delete
```

### `ggt status`

```sh-session
$ ggt status -h
Show sync state and pending file changes

USAGE
  ggt status [flags]

FLAGS
  -a, --app, --application <app>  Gadget app to use
  -e, --env, --environment <env>  Environment to use

EXAMPLES
  $ ggt status
  $ ggt status --app myapp --env staging
```

### `ggt problems`

```sh-session
$ ggt problems -h
Show errors and warnings in your app

USAGE
  ggt problems [flags]

FLAGS
  -a, --app, --application <app>  Gadget app to use
  -e, --env, --environment <env>  Environment to use

EXAMPLES
  $ ggt problems
  $ ggt problems --app myBlog
  $ ggt problems --env staging
  $ ggt problems --app myBlog --env production
```

### `ggt push`

```sh-session
$ ggt push -h
Upload local file changes to Gadget

USAGE
  ggt push [flags]

FLAGS
  -a, --app, --application <app>        Gadget app to use
  -e, --env, --environment, --to <env>  Environment to push to
  -f, --force                           Push without prompting, discarding environment changes

EXAMPLES
  $ ggt push
  $ ggt push --env main
  $ ggt push --env main --force
```

### `ggt pull`

```sh-session
$ ggt pull -h
Download environment files to your local directory

USAGE
  ggt pull [flags]

FLAGS
  -a, --app, --application <app>          Gadget app to use
  -e, --env, --environment, --from <env>  Environment to pull from
  -f, --force                             Pull without prompting, discarding local changes

EXAMPLES
  $ ggt pull
  $ ggt pull --env staging
  $ ggt pull --env production --force
```

### `ggt var`

```sh-session
$ ggt var -h
Manage your app's environment variables

USAGE
  ggt var <command> [flags]

COMMANDS
  list      List all environment variable keys
  get       Print the value of an environment variable
  set       Set one or more environment variables
  delete    Delete one or more environment variables
  import    Import variables from another environment or file

FLAGS
  -a, --app, --application <app>  Gadget app to use
  -e, --env, --environment <env>  Environment to use

EXAMPLES
  $ ggt var list
  $ ggt var get DATABASE_URL
  $ ggt var set API_KEY=abc123
  $ ggt var set SECRET=xyz --secret
  $ ggt var set CONNECTION_STRING=postgres://user:pass@host/db
  $ ggt var delete API_KEY
  $ ggt var delete --all --force
  $ ggt var import --from staging --all
  $ ggt var import --from-file .env --all
```

### `ggt env`

```sh-session
$ ggt env -h
Manage your app's environments

USAGE
  ggt env <command> [flags]

COMMANDS
  list       List all environments
  create     Create a new environment
  delete     Delete an environment
  unpause    Unpause a paused environment
  use        Switch the active environment for this directory

FLAGS
  -a, --app, --application <app>  Gadget app to use

EXAMPLES
  $ ggt env list
  $ ggt env create staging
  $ ggt env create staging --from development
  $ ggt env delete staging --force
  $ ggt env unpause staging
  $ ggt env use staging
```

### `ggt add`

```sh-session
$ ggt add -h
Add resources to your app

USAGE
  ggt add <command> [flags]

COMMANDS
  model          Add a new data model
  action         Add an action to a model or as a global action
  route          Add an HTTP route
  field          Add a field to an existing model
  environment    Create a new environment by cloning

FLAGS
  -a, --app, --application <app>  Gadget app to use
  -e, --env, --environment <env>  Environment to use

EXAMPLES
  $ ggt add model post
  $ ggt add model post title:string body:string
  $ ggt add field post/published:boolean
  $ ggt add action model/post/publish
  $ ggt add action action/audit
  $ ggt add route GET /hello
  $ ggt add environment staging
```

### `ggt model`

```sh-session
$ ggt model -h
Add and manage models in your app

USAGE
  ggt model <command> [flags]

COMMANDS
  add       Add a model to your app
  remove    Remove a model from your app
  rename    Rename a model

FLAGS
  -a, --app, --application <app>  Gadget app to use
  -e, --env, --environment <env>  Environment to use

EXAMPLES
  $ ggt model add post
  $ ggt model add shopifyProduct --type shopify
  $ ggt model remove post --force
  $ ggt model rename post article
```

### `ggt action`

```sh-session
$ ggt action -h
Add and manage actions

USAGE
  ggt action <command> [flags]

COMMANDS
  add    Add an action to your app

FLAGS
  -a, --app, --application <app>  Gadget app to use
  -e, --env, --environment <env>  Environment to use

EXAMPLES
  $ ggt action add sendWelcomeEmail
  $ ggt action add notifications/sendWelcomeEmail
  $ ggt action add publish --model post
  $ ggt action add fulfill --model shopifyOrder
```

### `ggt field`

```sh-session
$ ggt field -h
Manage fields on your models

USAGE
  ggt field <command> [flags]

COMMANDS
  add       Add a field to an existing model
  remove    Remove a field from a model
  rename    Rename a field on a model

FLAGS
  -a, --app, --application <app>  Gadget app to use
  -e, --env, --environment <env>  Environment to use

EXAMPLES
  $ ggt field add post/title:string
  $ ggt field add mystore/order/note:string
  $ ggt field remove post/title
  $ ggt field rename post/title post/heading
```

### `ggt shopify`

```sh-session
$ ggt shopify -h
Manage Shopify connection

USAGE
  ggt shopify <command> [flags]

COMMANDS
  connect    Configure the Shopify connection for your application
  status     Show the status of your Shopify connection

FLAGS
  -a, --app, --application <app>  Gadget app to use
  -e, --env, --environment <env>  Environment to use

EXAMPLES
  $ ggt shopify connect
  $ ggt shopify status
  $ ggt shopify connect --app-name my-shop
```

### `ggt open`

```sh-session
$ ggt open -h
Open your app in a browser

USAGE
  ggt open [location] [model] [flags]

ARGUMENTS
  location    Page to open: logs, permissions, data, or schema
  model       Model name for data or schema locations

FLAGS
  -a, --app, --application <app>  Gadget app to use
  -e, --env, --environment <env>  Environment to use
      --show-all                  Prompt to pick a model from the full list

EXAMPLES
  $ ggt open
  $ ggt open logs
  $ ggt open permissions
  $ ggt open data post
  $ ggt open schema post
  $ ggt open data --show-all
  $ ggt open schema --show-all
  $ ggt open data post --app myBlog --env staging
```

### `ggt list`

```sh-session
$ ggt list -h
List your Gadget apps

USAGE
  ggt list

EXAMPLES
  $ ggt list
  $ ggt list --json
```

### `ggt login`

```sh-session
$ ggt login -h
Log in to Gadget

USAGE
  ggt login

EXAMPLES
  $ ggt login
```

### `ggt logout`

```sh-session
$ ggt logout -h
Log out of Gadget

USAGE
  ggt logout

EXAMPLES
  $ ggt logout
```

### `ggt logs`

```sh-session
$ ggt logs -h
Print recent logs or stream logs from your app

USAGE
  ggt logs [flags]

FLAGS
  -a, --app, --application <app>  Gadget app to use
  -e, --env, --environment <env>  Environment to use
  -f, --follow                    Stream logs continuously
  -l, --log-level <level>         Minimum log level to display
  -m, --my-logs                   Show only logs emitted by your code
      --start <datetime>          Start time for one-shot log queries

EXAMPLES
  $ ggt logs
  $ ggt logs --start 2025-01-01T00:00:00Z --log-level warn
  $ ggt logs --follow --my-logs
  $ ggt logs --env production --json
```

### `ggt debugger`

```sh-session
$ ggt debugger -h
Connect a debugger to your app's environment

USAGE
  ggt debugger [directory] [flags]

ARGUMENTS
  directory    App directory to use

FLAGS
  -a, --app, --application <app>  Gadget app to use
  -c, --configure <editor>        Write editor debug config files (vscode, cursor)
  -e, --env, --environment <env>  Environment to use
  -p, --port <port>               Local port for the CDP proxy

EXAMPLES
  $ ggt debugger
  $ ggt debugger --port 9230
  $ ggt debugger --configure vscode
  $ ggt debugger --configure cursor
  $ ggt debugger --app myApp --env development
  $ ggt debugger --port 9230 --configure vscode
```

### `ggt whoami`

```sh-session
$ ggt whoami -h
Show the current logged-in user

USAGE
  ggt whoami

EXAMPLES
  $ ggt whoami
```

### `ggt configure`

```sh-session
$ ggt configure -h
Manage ggt configuration

USAGE
  ggt configure <command>

COMMANDS
  show      Show current configured defaults
  change    Interactively change configuration options
  clear     Remove all configured defaults

EXAMPLES
  $ ggt configure show
  $ ggt configure change
  $ ggt configure clear
```

### `ggt agent-plugin`

```sh-session
$ ggt agent-plugin -h
Manage plugins for AI coding assistants

USAGE
  ggt agent-plugin <command>

COMMANDS
  install    Install agent plugins into the current project
  update     Update agent plugins to the latest version

EXAMPLES
  $ ggt agent-plugin install
  $ ggt agent-plugin install --force
  $ ggt agent-plugin update
```

### `ggt eval`

```sh-session
$ ggt eval -h
Evaluate a JavaScript snippet against your app

USAGE
  ggt eval <snippet> [flags]

ARGUMENTS
  snippet     JavaScript expression or statement to run

FLAGS
  -a, --app, --application <app>  Gadget app to use
  -e, --env, --environment <env>  Environment to use
  -w, --allow-writes              Allow write operations (read-only by default)

EXAMPLES
  $ ggt eval 'api.user.findMany()'
  $ ggt eval 'api.post.findMany({ select: { id: true, title: true } })'
  $ ggt eval --app my-app --env staging 'api.user.findFirst()'
  $ ggt eval -w 'api.user.delete("123")'
  $ ggt eval --json 'api.user.count()'
  $ ggt eval 'const users = await api.user.findMany(); return users.length'
```

### `ggt version`

```sh-session
$ ggt version -h
Print the currently installed version

USAGE
  ggt version

EXAMPLES
  $ ggt version
```

### `ggt completion`

```sh-session
$ ggt completion -h
Generate shell completion scripts

USAGE
  ggt completion <command>

COMMANDS
  bash    Generate bash completion script
  zsh     Generate zsh completion script
  fish    Generate fish completion script

EXAMPLES
  $ ggt completion bash
  $ ggt completion zsh
  $ ggt completion fish
```
