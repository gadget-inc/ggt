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
  - [`ggt add`](#ggt-add)
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

  Usage
    ggt [COMMAND]

  Commands
dev              Start developing your application
deploy           Deploy your environment to production
status           Show your local and environment's file changes
push             Push your local files to your environment
pull             Pull your environment's files to your local computer
var              Manage environment variables
add              Add models, fields, actions, routes and environments to your app
open             Open a Gadget location in your browser
list             List your available applications
login            Log in to your account
logout           Log out of your account
logs             Stream your environment's logs
debugger         Connect to the debugger for your environment
whoami           Print the currently logged in account
configure        Configure default execution options
agent-plugin     Install Gadget agent plugins
version          Print this version of ggt
completion       Generate shell completion scripts

  Flags
    -h, --help       Print how to use a command
    -v, --verbose    Print more verbose output
        --telemetry  Enable telemetry

  Agent plugins
    Install AGENTS.md and Gadget agent skills for your coding agent:
    ggt agent-plugin install

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
```

### `ggt deploy`

```sh-session
$ ggt deploy -h
Deploys your app to production.

This command first performs a sync to ensure that your local and environment directories
match, changes are tracked since last sync. If any conflicts are detected, they must be
resolved before deployment.
```

### `ggt status`

```sh-session
$ ggt status -h
  Show your local and environment's file changes

  Usage
    ggt status [options]

  Flags
    -a, --application, --app <value>  Select the application
    -e, --environment, --env <value>  Select the environment
        --allow-different-app         Allow syncing a different app than the one in sync.json
        --allow-unknown-directory     Allow syncing an unrecognized directory

  Examples
    $ ggt status

  Run "ggt status --help" for detailed help.
```

### `ggt problems`

```sh-session
$ ggt problems -h
  Show problems found in your application

  Usage
    ggt problems [options]

  Flags
    -a, --application, --app <value>  Select the application
    -e, --environment, --env <value>  Select the environment

  Examples
    $ ggt problems

  Run "ggt problems --help" for detailed help.
```

### `ggt push`

```sh-session
$ ggt push -h
Pushes your local files to your environment directory.

This command first tracks changes in your environment directory since the last sync.
If changes are detected, you will be prompted to discard them or abort the push.
```

### `ggt pull`

```sh-session
$ ggt pull -h
Pulls your environment files to your local directory.

This command first tracks changes in your local directory since the last sync. If changes are
detected, you will be prompted to discard them or abort the pull.
```

### `ggt var`

```sh-session
$ ggt var -h
  Manage environment variables

  Usage
    ggt var <command> [options]

  Commands
    list                  List all environment variables
    get                   Get the value of an environment variable
    set                   Set one or more environment variables
    delete                Delete one or more environment variables
    import                Import environment variables from another environment or file

  Flags
    -a, --application, --app <value>  Select the application
    -e, --environment, --env <value>  Select the environment

  Examples
    $ ggt var list --app=my-app --env=development
    $ ggt var set API_KEY=abc123 --secret
    $ ggt var delete --all --force
    $ ggt var import --from=staging --all

  Run "ggt var --help" for detailed help.
```

### `ggt add`

```sh-session
$ ggt add -h
Adds models, fields, actions and routes to your app.

This command first performs a sync to ensure that your local and environment directories match, changes are tracked since last sync.
If any conflicts are detected, they must be resolved before adding models, fields, actions or routes.

Resource syntax
  ggt add model <model_name> [field_name:field_type ...]

  ggt add action [CONTEXT]/<action_name>
  CONTEXT: Specifies the kind of action. Use "model" for model actions otherwise use "action".

  ggt add route <HTTP_METHOD> <route_path>

  ggt add field <model_path>/<field_name>:<field_type>
```

### `ggt open`

```sh-session
$ ggt open -h
This command opens a specific Gadget page in your browser, allowing you to directly access
various parts of your application's interface such as logs, permissions, data views, or
schemas.

LOCATION specifies the part of Gadget to open. By default it opens the app's home page:

  logs          Opens logs
  permissions   Opens permissions
  data          Opens data editor for a specific model
  schema        Opens schema editor for a specific model
```

### `ggt list`

```sh-session
$ ggt list -h
  List your available applications

  Usage
    ggt list [options]

  Examples
    $ ggt list

  Run "ggt list --help" for detailed help.
```

### `ggt login`

```sh-session
$ ggt login -h
  Log in to your account

  Usage
    ggt login [options]

  Examples
    $ ggt login

  Run "ggt login --help" for detailed help.
```

### `ggt logout`

```sh-session
$ ggt logout -h
  Log out of your account

  Usage
    ggt logout [options]

  Examples
    $ ggt logout

  Run "ggt logout --help" for detailed help.
```

### `ggt logs`

```sh-session
$ ggt logs -h
  Stream your environment's logs

  Usage
    ggt logs [options]

  Flags
    -a, --application, --app <value>  Select the application
    -e, --environment, --env <value>  Select the environment
    -ll, --log-level <value>          Set the log level
        --my-logs                     Show only my logs

  Examples
    $ ggt logs --env development --my-logs
    $ ggt logs --env production --json

  Run "ggt logs --help" for detailed help.
```

### `ggt debugger`

```sh-session
$ ggt debugger -h
Start a Chrome DevTools Protocol proxy server that connects to the Gadget debugger.
This allows you to debug your Gadget app using VS Code, Chrome DevTools, or any other
CDP-compatible debugger client.

Use --configure with one of: vscode, cursor to set up editor integration.
```

### `ggt whoami`

```sh-session
$ ggt whoami -h
  Print the currently logged in account

  Usage
    ggt whoami [options]

  Examples
    $ ggt whoami

  Run "ggt whoami --help" for detailed help.
```

### `ggt configure`

```sh-session
$ ggt configure -h
Make changes to the configured defaults. This allows you to set an option on every ggt command by default without
needing to set a flag on every command.
```

### `ggt agent-plugin`

```sh-session
$ ggt agent-plugin -h
  Install Gadget agent plugins

  Usage
    ggt agent-plugin [options]

  Commands
    install               Install Gadget agent plugins into the current project

  Flags
        --force             Overwrite/reinstall even if already present

  Examples
    $ ggt agent-plugin install
    $ ggt agent-plugin install --force

  Run "ggt agent-plugin --help" for detailed help.
```

### `ggt eval`

```sh-session
$ ggt eval -h
The snippet receives an api variable (a pre-constructed Gadget API client
authenticated as the developer). Results are formatted like Node.js REPL output.
Writes are disallowed by default; use --allow-writes to enable them.
```

### `ggt version`

```sh-session
$ ggt version -h
Updating ggt
      When there is a new release of ggt, running ggt will show you a message letting you
      know that an update is available.
```

### `ggt completion`

```sh-session
$ ggt completion -h
Installation
  Bash (add to ~/.bashrc):
    source <(ggt completion bash)

  Zsh (add to ~/.zshrc):
    source <(ggt completion zsh)

  Fish:
    ggt completion fish | source
    # Or to persist:
    ggt completion fish > ~/.config/fish/completions/ggt.fish
```
