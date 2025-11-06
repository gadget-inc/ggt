# @gadgetinc/ggt

## 1.7.4

### Patch Changes

- 4089900: Make `ggt push` retry "Files version mismatch" errors when possible.

## 1.7.3

### Patch Changes

- 1b5d93e: Added `.shopify` to the list of always ignored files. It is a local only folder and doesn't need to be synced with your Gadget environment.

## 1.7.2

### Patch Changes

- 5da096a: Add `unref` to the session update interval to allow the process to exit.

## 1.7.1

### Patch Changes

- f7076b3: Automatically refresh the authentication session to avoid expiration.

## 1.7.0

### Minor Changes

- ca8964b: Add a logs command to stream logs from any environment

## 1.6.1

### Patch Changes

- 3bf13cb: Misc fixes from telemetry data, specifically including fixes for two bugs where expected app behavior can wrongly display an unexpected error.

## 1.6.0

### Minor Changes

- 1171831: Add a mechanism for configuring default options when running ggt commands.

## 1.5.1

### Patch Changes

- ca25131: Restrict SSL/TLS to require TLSv1.1 or better. SSLv3 will no longer be supported.

## 1.5.0

### Minor Changes

- 8bf2df7: New `ggt add env` command has been added to allow for environment creation.

## 1.4.2

### Patch Changes

- a42ba35: Enable `keepAlive` in the graphql-ws client to keep the connection alive.

  Users have pointed out that `ggt dev` stops receiving file updates sometimes after their computer has gone to sleep.

  This fixes that issue by enabling the `keepAlive` option in the graphql-ws client. This makes the client send a ping every few seconds to the server to ensure the connection is still alive. Luckily for us, we've already implemented the pong handler on our servers because we use this same pattern in our editor!

## 1.4.1

### Patch Changes

- e3fe0bb: Don't automatically enable source maps

  We introduced `--enable-source-maps` in v1.4.0 using the following shebang:

  ```
  #!/usr/bin/env -S node --enable-source-maps
  ```

  This change was made so that source maps would be enabled by default when running `ggt`, giving Gadget employees more information when `ggt` crashes. However, this has caused some issues with certain environments (e.g. `'-S' is not recognized as an internal or external command`), so we are reverting this change and will go back to the following shebang:

  ```
  #!/usr/bin/env node
  ```

  If you are running `ggt` and want source maps enabled, you can still do so by running `ggt` with the `NODE_OPTIONS` environment variable set to `--enable-source-maps`:

  ```
  NODE_OPTIONS='--enable-source-maps' ggt
  ```

## 1.4.0

### Minor Changes

- fcb272f: Add more `--env` aliases.

  - `ggt pull` now accepts `--from` as an alias for `--env`
  - `ggt push` now accepts `--to` as an alias for `--env`

- 7da5de8: Allow `ggt pull --from=production` to pull files from your production environment.

### Patch Changes

- 3f9b60d: Attempt to fix `Error: dest already exists.` by moving files one at a time to `.gadget/backup/`.
- 9aa8657: Enable source maps for better error messages and debugging.

## 1.3.3

### Patch Changes

- da25b70: Fix the following assertion error from occurring:

  ```
  An error occurred while communicating with Gadget

  '' == true

  If you think this is a bug, click here to create an issue on GitHub.
  ```

## 1.3.2

### Patch Changes

- 11eca08: Fix `ggt pull --force` still asking for confirmation.

## 1.3.1

### Patch Changes

- c7cc65e: Make `ggt deploy --force` skip asking for confirmation to push.

  `ggt deploy --force` implies that you want to discard any existing changes on the environment you are deploying from, so it should not ask for confirmation to push.

- b3752b6: Fix `ggt push --force` still asking for confirmation.

## 1.3.0

### Minor Changes

- 04fcce2: `ggt dev` now outputs application logs!

  In our push to make your local development experience as streamlined as possible, we've now included application logs, by default, to output during a sync session!

  ![CleanShot 2024-10-02 at 16 04 03@2x](https://github.com/user-attachments/assets/840c23fd-8532-4b99-ad30-e0bb936afc10)

  Not only that, as long as your terminal supports linking, traceID(s) are also setup to take you to the editor logs!

  ![CleanShot 2024-10-02 at 16 10 53](https://github.com/user-attachments/assets/e5e2b172-c7a7-43b3-b329-d84600f9f8ab)

  No worries if the verbose output isn't your thing, we've got you covered:

  - `--no-logs` - completely turns off this new feature
  - `--my-logs` - same as the editor logs boolean for only showing my logs/events
  - `--log-level` - Set the log level for incoming application logs, `debug, info, error`

  As always any more info can be found through `ggt dev --help`!

### Patch Changes

- 38210c3: Never ignore `.gadget/` directory

  ggt no longer ignores the `.gadget/` directory when it is listed in the `.ignore` file. The `.gadget/` directory is managed by ggt and ignoring it causes issues like infinite sync loops.

## 1.2.0

### Minor Changes

- 05cc186: `ggt deploy` will now show a deleted data warning when pushing changes to production that would cause data loss.

  <img width="654" alt="image" src="https://github.com/user-attachments/assets/52b45cc7-54fb-480e-ad73-2d80fea3d4eb">

## 1.1.0

### Minor Changes

- 87875c9: Dropped support for downgrading to ggt v0.4.x

  ggt v1.1.x will no longer output a `.gadget/sync.json` file that is compatible with ggt v0.4.x. This means local directories that are synced with ggt v1.1.x will no longer be able to be synced with ggt v0.4.x. This change was made to simplify and reduce the complexity of the codebase.

### Patch Changes

- e83ea58: Updated app select to show apps grouped by team!

  ![CleanShot 2024-08-30 at 17 44 39@2x](https://github.com/user-attachments/assets/ca15c319-77a9-4c8b-a6a9-5eef55a72869)

## 1.0.6

### Patch Changes

- 09c1010: Fix `ggt deploy` immediately exiting after confirmation.

## 1.0.5

### Patch Changes

- 18fb3ca: Bump semver from 7.6.2 to 7.6.3
- c7632e3: Bump @sentry/node from 8.18.0 to 8.19.0
- 269554f: Bump dayjs from 1.11.11 to 1.11.12
- 35cfaf7: Bump boxen from 7.1.1 to 8.0.0
- 1a82708: Bump normalize-package-data from 6.0.0 to 6.0.2
- 90ba3fd: Bump ws from 8.17.1 to 8.18.0
- 0063723: Bump @sentry/node from 7.114.0 to 8.17.0
- dc39c5d: Downgrade execa from 9.3.0 to 8.0.1 to support Node.js 18 versions lower than 18.18.0
- 557f56b: Use esbuild to bundle, minify, and tree-shake code and dependencies
- 8d649a1: Bump @sentry/node from 8.17.0 to 8.18.0
- 72d7d39: Bump graphql from 16.8.2 to 16.9.0
- 15d1ad9: Bump string-width from 7.1.0 to 7.2.0
- 7a64bd8: Fixed an issue causing `ggt deploy` to hang after deploying an app.
- 323b386: Fixed an issue causing `ggt dev` to print "Pulled files." when only hidden files were pulled.

## 1.0.4

### Patch Changes

- 9574bf5: Bump execa from 9.1.0 to 9.2.0
- 4332f75: Bump graphql from 16.8.1 to 16.8.2
- d9bf026: Bump ws from 8.17.0 to 8.17.1
- 9f3fd75: Bump simple-git from 3.24.0 to 3.25.0
- 2a3389e: Log the login URL for manual login in case of browser opening failure.

## 1.0.3

### Patch Changes

- 55ec815: Bump simple-git from 3.23.0 to 3.24.0
- 74c891e: Bump ws from 8.16.0 to 8.17.0
- abe0c7b: Bump @sentry/node from 7.110.0 to 7.110.1
- b13336e: Bump zod from 3.23.0 to 3.23.4
- 7d1c6dc: Bump watcher from 2.3.0 to 2.3.1
- 4d064ad: Bump zod from 3.23.4 to 3.23.5
- aa0c6e6: Bump cli-table3 from 0.6.4 to 0.6.5
- e7969d5: Bump p-map from 7.0.1 to 7.0.2
- 48400d8: Bump ansi-escapes from 6.2.1 to 7.0.0
- 6a4d322: Bump graphql-ws from 5.15.0 to 5.16.0
- 655a5ea: Bump dayjs from 1.11.10 to 1.11.11
- f33d833: Bump zod from 3.22.4 to 3.22.5
- 998ca41: Bump @sentry/node from 7.107.0 to 7.108.0
- a1f4716: Bump cli-table3 from 0.6.3 to 0.6.4
- 3fec44a: Bump @swc/helpers from 0.5.8 to 0.5.9
- 40e4d1f: Bump @sentry/node from 7.111.0 to 7.112.1
- 8f751b1: Bump @sentry/node from 7.109.0 to 7.110.0
- b844d41: Bump @sentry/node from 7.112.1 to 7.112.2
- c26fdd1: Bump @swc/helpers from 0.5.7 to 0.5.8
- f2c6a85: Bump @sentry/node from 7.113.0 to 7.114.0
- 41e9fe6: Bump @sentry/node from 7.112.2 to 7.113.0
- b3211ae: Bump ansi-escapes from 6.2.0 to 6.2.1
- bb2e48b: Bump execa from 8.0.1 to 9.0.2
- f28f41b: Bump @sentry/node from 7.110.1 to 7.111.0
- 82819ab: Bump zod from 3.23.6 to 3.23.8
- 6bfe832: Bump @sentry/node from 7.108.0 to 7.109.0
- ee3256c: Bump zod from 3.23.5 to 3.23.6
- 25e8de0: Bump zod from 3.22.5 to 3.23.0
- 3ef52c3: Bump semver from 7.6.1 to 7.6.2
- b9a643a: Bump execa from 9.0.2 to 9.1.0
- e5ae6e3: Bump semver from 7.6.0 to 7.6.1
- 8d8d922: New command! `ggt add`

  The `ggt add` command enables you to conveniently add a model, action, or route to your gadget project directly from your local development environment.

## 1.0.2

### Patch Changes

- 0327764: Fix `Unexpected server response: 404`

  ggt was always using the `--development` url when subscribing to Gadget's GraphQL API. This was fine if your app had an environment named `development`, but would fail with a 404 if your app didn't have an environment named `development`.

## 1.0.1

### Patch Changes

- ccf9e4d: Bump simple-git from 3.22.0 to 3.23.0
- 0944809: Bump @sentry/node from 7.106.1 to 7.107.0
- 8c9672f: Bump mimic-function from 5.0.0 to 5.0.1
- 50af8a5: Bump @sentry/node from 7.106.0 to 7.106.1
- e1abd14: Cleanup empty directories.

  We've improved how `ggt` calculates which empty directories need to be removed. This should result in fewer empty directories being left behind while running `ggt dev`.

- b838cd3: Bump get-port from 7.0.0 to 7.1.0
- 2bedcf2: Bump @swc/helpers from 0.5.6 to 0.5.7
- e3d3ca6: Handle existing files in the `.gadget/backup/` directory.

  When `ggt` needs to backup a file that already exists in the `.gadget/backup/` directory, it will now remove the existing file before creating the backup. This should prevent the following error from occurring:

  ```
  Error: ENOTDIR: not a directory, lstat '.gadget/backup/routes/webhooks/POST-github.js'
  ```

## 1.0.0

### Major Changes

- c420a54: Require Node 18 or later

  ## `ggt` requires Node 18 or later to run

  Node 16 reached End-of-Life (EOL) on 2023-09-11:

  - https://github.com/nodejs/release#end-of-life-releases
  - https://nodejs.org/en/blog/announcements/nodejs16-eol

  This means Node 16 no longer receives security updates and bug fixes.

  ggt runs on your computer, so it's important to use a supported version of Node to ensure you have the latest security updates. **Your Gadget environment will continue to use the Node version specified in your [Framework version](https://docs.gadget.dev/guides/gadget-framework).**

- 91de55b: Release v1.0.0

  ## `ggt` v1.0.0 is here!

  We're excited to announce the release of `ggt` v1.0.0! This release is the culmination of months of hard work and includes a bunch of new commands to take advantage of Gadget's v1 launch week 👀

  Let's take a look at what's new:

  ### `ggt dev`

  `ggt dev` replaces `ggt sync` and is the new and improved way to develop your Gadget app locally. It comes with a fresh new look and feel, making sure you always know which environment and git branch you're developing on.

  That's right, `ggt dev` is git and multi-environment aware, and comes with a new `--env` flag to change which environment you're developing on.

  ![ggt dev example](https://github.com/gadget-inc/ggt/assets/21965521/88413d2c-b00a-4a06-8493-96d7f8cceb8f)

  > [!NOTE]
  >
  > `ggt sync` is now deprecated and will be removed in a future release. From now on, if you run `ggt sync`, `ggt dev` will be run instead.

  ### `ggt status`

  Now that you can develop on multiple environments, it's important to know which environment you're currently developing on. That's where `ggt status` comes in. It shows you the current environment and git branch you're developing on, as well as the status of your local files compared to your environment's files.

  ![ggt status example](https://github.com/gadget-inc/ggt/assets/21965521/4590af24-59c1-40ed-a2f4-8dfd05c603a6)

  ### `ggt push` and `ggt pull`

  When you need to push your local files to your environment, or pull your environment's files to your local machine without having ggt
  continue to watch for changes, you can use `ggt push` and `ggt pull` respectively.

  `ggt push` and `ggt pull` are also environment aware, so you can use the `--env` flag to specify which environment you want to push or pull from.

  ![ggt push example](https://github.com/gadget-inc/ggt/assets/21965521/e7f739a9-e944-41d0-8563-d7a70af8cc2e)

  ### `ggt deploy`

  Once you're ready to deploy your environment to production, you can use `ggt deploy`. This command will ensure your environment's files are up to date with your local files, and then deploy your environment to production 🎉

  ![ggt deploy example](https://github.com/gadget-inc/ggt/assets/21965521/3298ca86-8882-461e-bb9a-aef8cf7661ad)

  ### `ggt open`

  Finally, we've added `ggt open` to quickly open your Gadget app in your default browser. Run `ggt open --help` to see all the places you can open your browser to.

  ![ggt open example](https://github.com/gadget-inc/ggt/assets/21965521/9af3cde8-0faa-4b75-9866-f239911950fc)

  ### This is just the beginning

  Even though `ggt` v1.0.0 is here, we're not done yet. We have a lot of exciting features and improvements planned for the future. Don't be surprised to see a few v1.0.x releases in the coming days as we iron out any kinks the community finds 😅

  We hope you enjoy the new `ggt` commands and the new `ggt dev` experience. We're excited to see what you build with Gadget v1!

### Patch Changes

- c48efcb: Bump @sentry/node from 7.103.0 to 7.104.0
- 163e72b: Bump @sentry/node from 7.105.0 to 7.106.0
- c939101: Bump @swc/helpers from 0.5.3 to 0.5.6
- 2366c1c: Bump graphql-ws from 5.14.3 to 5.15.0
- ece8f55: Bump string-width from 6.1.0 to 7.1.0
- 9ac8c78: Bump @sentry/node from 7.101.0 to 7.101.1
- 3404930: Bump @sentry/node from 7.95.0 to 7.98.0
- 147057f: Bump @sentry/node from 7.102.1 to 7.103.0
- f80c289: Bump ignore from 5.3.0 to 5.3.1
- 7ea926a: Bump semver from 7.5.4 to 7.6.0
- 3991c3d: Bump @sentry/node from 7.93.0 to 7.94.1
- 2402194: Bump p-map from 6.0.0 to 7.0.1
- 4dd62aa: Bump @sentry/node from 7.102.0 to 7.102.1
- 96f7e19: Bump @sentry/node from 7.94.1 to 7.95.0
- ecef4e7: Bump open from 10.0.4 to 10.1.0
- 56366c0: Bump find-up from 6.3.0 to 7.0.0
- ec9a401: Bump @sentry/node from 7.104.0 to 7.105.0
- e95a97f: Bump @sentry/node from 7.101.1 to 7.102.0
- 50907f3: Bump @sentry/node from 7.98.0 to 7.101.0

## 0.4.10

### Patch Changes

- 9ce8743: Handle new `GGT_FILES_VERSION_MISMATCH` error.

## 0.4.9

### Patch Changes

- adc1645: Bump @sentry/node from 7.91.0 to 7.92.0
- fced7a6: Bump @sentry/node from 7.92.0 to 7.93.0
- 5534551: Retry errors when backing up files on Windows more often.
- bb06525: Retry `EADDRNOTAVAIL` and `EHOSTUNREACH` errors and retry failed http requests more often.
- 3b34a05: Display the primary domain for the /edit + playground links

## 0.4.8

### Patch Changes

- 346ceb8: Bump ws from 8.15.1 to 8.16.0
- b1d54bb: Bump @sentry/node from 7.90.0 to 7.91.0
- 2ce747e: Bump p-retry from 6.1.0 to 6.2.0
- 9056880: Automatically retry GraphQL query errors
- cc1151c: Run `yarn install` on initial sync

## 0.4.7

### Patch Changes

- 8c02697: Bump @sentry/node from 7.89.0 to 7.90.0
- 00d3285: Bump graphql-ws from 5.14.2 to 5.14.3
- 48c8f7b: Bump @sentry/node from 7.88.0 to 7.89.0
- b55345e: ggt can now recover from "Files version mismatch" errors! 🎉

  Gadget has a concept of a "files version" which keeps track of the state of your Gadget environment's files. Every time your files change, Gadget increments your files version.

  When ggt sends files to Gadget, it also sends along the files version it expects Gadget to be at. If Gadget's files version matches the one ggt sent, then Gadget will accept the changes and increment its files version. If Gadget's files version doesn't match the one ggt sent, then Gadget will refuse the changes and send back a "Files version mismatch" error like this:

  ```
  Gadget responded with the following error:

    Files version mismatch, expected 67 but got 68
  ```

  There are 2 common causes for this error:

  - You make a change that causes Gadget to generate files and you don't receive those files before sending more changes to Gadget.
  - Multiple people are syncing at the same time and one person sends changes to Gadget before receiving another persons changes.

  Before, ggt didn't have a reliable way to detect and resolve de-syncs so it would crash and force you to restart 😞

  However, now that [we've improved ggt's de-sync detection](https://github.com/gadget-inc/ggt/releases/tag/v0.4.0), it can automatically recover from "Files version mismatch" errors by re-syncing and continuing to watch for changes like normal!

  If the changes that caused the "Files version mismatch" error are conflicting, then ggt will prompt you to choose which changes to keep before continuing to watch for more changes, the same way it does when you first start syncing. If you always want to keep your local changes during a "Files version mismatch" error, you can use the `--prefer=local` flag.

  We hope this makes your development experience with Gadget more enjoyable.

  Happy Holidays! 🎄🎁

- 3ef4c57: Retry errors when sending files to Gadget

## 0.4.6

### Patch Changes

- 03938ae: Disabled file permission syncing

  We have temporarily disabled the ability to sync file permissions between your local filesystem and your Gadget environment. This is due to a bug that is causing permissions not to be set correctly when changed via `ggt sync`. We have created a ticket to track this issue and will re-enable this feature once it is resolved.

  In the meantime, if you need to change a file's permissions in your Gadget environment, you can do so by opening the command palette by pressing `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS) and running `chmod` on the file directly.

  Here's an example of how to change the permissions on a file named `test.sh` to be executable:

  ![CleanShot 2023-12-18 at 17 58 10@2x](https://github.com/gadget-inc/ggt/assets/21965521/13f06911-6abe-4ee5-ad63-0446ba65b62f)

## 0.4.5

### Patch Changes

- 07dc9a4: Bump "hashes are not equal" log level to debug
- 86ffacd: Fix formatting of `Map` objects in pretty printed logs

## 0.4.4

### Patch Changes

- 4735996: Fix local `yarn-error.log` causing `TooManySyncAttemptsError`

## 0.4.3

### Patch Changes

- c783efa: Fix `TooManySyncAttemptsError` when local directory's permissions don't match Gadget's
- 340a5de: Fix errors serializing `bigint`s when `--json` is passed
- 3de43d1: Logging improvements:
  - No longer truncating arrays in logs when `--json` is passed
  - Now truncating objects in logs unless log level is trace
  - Showing number of truncated elements/properties when arrays/objects are truncated

## 0.4.2

### Patch Changes

- 59d9f68: Convert [error] -> error

## 0.4.1

### Patch Changes

- 534e390: Fix an incorrect assertion in that causes `ggt sync` to crash with:

  ```
  expected environmentChanges to have created files
  ```

## 0.4.0

### Minor Changes

- 770beb1: We made some improvements to our debug logs!

  Previously, we were using the `debug` package to log messages. This was good at first, but now that we're adding more features to `ggt` we need more control over our logs. We want to be able to output structured logs, control the verbosity, and output them as JSON so that we can pipe them to another tool or parse them in a script.

  To accomplish this, we've added 2 new flags:

  - `-v, --verbose` to output structured logs

    This replaces the `--debug` flag, which was a boolean flag that would print out all logs. This new flag is a counter, so you can use it multiple times to increase the verbosity of the logs. Currently, there are 3 levels of verbosity:

    - `-v` = INFO
    - `-vv` = DEBUG
    - `-vvv` = TRACE

  - `--json` to print out logs in JSON format

    This is useful if you want to pipe the logs to another tool, or if you want to parse the logs in a script.

- 346dfa6: Improvements to `ggt sync`!

  ### Improved de-sync detection and conflict resolution:

  `ggt sync` can now detect all discrepancies between your local filesystem and your Gadget environment's filesystem. Previously, if a file was deleted locally while `ggt sync` was not running, `ggt sync` could not detect that the file was deleted and would not delete the file in your Gadget environment.

  Now, `ggt sync` can detect the following discrepancies:

  - Files that exist locally but not in your Gadget environment
  - Files that exist in your Gadget environment but not locally
  - Files that exist locally and in your Gadget environment but have different contents
  - Files that exist locally and in your Gadget environment but have different permissions
    - Only supported when the local filesystem is macOS or Linux

  When `ggt sync` starts, it will compare your local filesystem to your Gadget environment's filesystem and calculate the changes that have occurred since the last time `ggt sync` was run.

  You will be prompted to resolve conflicts if:

  - Both filesystems updated the same file with different contents
  - One filesystem updated a file and the other deleted it

  Otherwise, `ggt sync` will automatically merge the changes from both filesystems and begin watching for changes.

  With the new de-sync detection in place, we now _have the technology_ to solve the dreaded "Files version mismatch" error that causes `ggt sync` to crash so often. Be on the lookout for a fix to this error in the near future! 👀

  ### New `--prefer` flag:

  `ggt sync` has a new `--prefer` flag that will resolve conflicts in favor of the specified filesystem. This is useful if you always want to resolve conflicts in favor of your local filesystem or your Gadget environment's filesystem.

  ```sh
  # keep your local filesystem's conflicting changes
  $ ggt sync --prefer=local

  # keep your Gadget environment's conflicting changes
  $ ggt sync --prefer=gadget
  ```

  ### New `--once` flag:

  `ggt sync` has a new `--once` flag that will only sync local filesystem once and then exit. This flag in combination with `--prefer` is useful if you want to run `ggt sync` in a script or CI/CD pipeline and ensure that the sync will not hang waiting for user input.

  ```sh
  $ ggt sync --once --prefer=local
  ```

- 7dd74be: We got the `ggt` npm package name! 🎉

  Gadget now owns the `ggt` package on [NPM](https://www.npmjs.com/package/ggt)! This means you can turn this:

  ```sh
  $ npx @gadgetinc/ggt@latest sync ~/gadget/example --app=example
  ```

  Into this:

  ```sh
  $ npx ggt@latest sync ~/gadget/example --app=example
  ```

  If you've already installed `@gadgetinc/ggt` globally, you'll need to uninstall it first:

  ```sh
  $ npm uninstall -g @gadgetinc/ggt
  # or
  $ yarn global remove @gadgetinc/ggt
  ```

  Then you can install the `ggt` package:

  ```sh
  $ npm install -g ggt@latest
  # or
  $ yarn global add ggt@latest
  ```

  It's a small change, but it's less typing and easier to remember. We hope you enjoy it!

  We're going to keep the `@gadgetinc/ggt` package up-to-date with the `ggt` package, so you can continue to use `@gadgetinc/ggt` if you prefer. We'll let you know if we ever decide to deprecate `@gadgetinc/ggt`.

### Patch Changes

- 87e630b: Bump @sentry/node from 7.86.0 to 7.87.0
- 628c24f: Bump @sentry/node from 7.80.1 to 7.81.0
- 9871c6e: Bump @sentry/node from 7.84.0 to 7.85.0
- 82536a8: Bump @sentry/node from 7.79.0 to 7.80.0
- 9982d1d: Bump ws from 8.15.0 to 8.15.1
- ae25c76: Bump @sentry/node from 7.75.1 to 7.76.0
- dbbbc96: Bump @sentry/node from 7.81.1 to 7.82.0
- f9385ea: Bump ignore from 5.2.4 to 5.3.0
- 041cfe4: Bump fs-extra from 11.1.1 to 11.2.0
- 197bec8: Bump serialize-error from 11.0.2 to 11.0.3
- 0a555c0: Bump @sentry/node from 7.82.0 to 7.84.0
- 29c6ed0: Bump @sentry/node from 7.80.0 to 7.80.1
- bdc646d: Bump @sentry/node from 7.76.0 to 7.77.0
- 8075a9b: Bump @sentry/node from 7.85.0 to 7.86.0
- 4b67530: Bump @inquirer/select from 1.3.0 to 1.3.1
- 188e22f: Bump @sentry/node from 7.77.0 to 7.79.0
- e638ad0: Bump @sentry/node from 7.87.0 to 7.88.0
- bfb6152: Bump ws from 8.14.2 to 8.15.0
- d69f01f: Bump @sentry/node from 7.81.0 to 7.81.1

## 0.3.3

### Patch Changes

- 12c37d1: Bump @sentry/node from 7.74.1 to 7.75.0
- 5af4580: Bump @sentry/node from 7.75.0 to 7.75.1
- cb9b5cf: Reduce bundle size

## 0.3.2

### Patch Changes

- f42c2cf: Print login url if open fails

## 0.3.1

### Patch Changes

- fb77c47: Fix filesync directory parsing

## 0.3.0

### Minor Changes

- b22ca48: Remove Oclif

### Patch Changes

- 585833f: Bump @sentry/node from 7.74.0 to 7.74.1
- bf3699d: Bump graphql-ws from 5.14.1 to 5.14.2
- d3d70be: Bump @sentry/node from 7.73.0 to 7.74.0
- 6534b3e: Fix errors when moving files to `.gadget/backup`
- 01db3a9: Bump normalize-package-data from 5.0.0 to 6.0.0
- 8ac8018: Bump is-wsl from 2.2.0 to 3.1.0
- a366005: Prevent `ggt sync` from sending back directories that it just received.

## 0.2.4

### Patch Changes

- 2d18526: Bump @oclif/plugin-warn-if-update-available from 2.1.0 to 2.1.1
- 29b1454: Bump @sentry/node from 7.62.0 to 7.64.0
- b5f886c: Bump graphql from 16.8.0 to 16.8.1
- 66c069d: Bump @sentry/node from 7.71.0 to 7.72.0
- 28c489a: Bump inquirer from 9.2.10 to 9.2.11
- 29bb98f: Bump watcher from 2.2.2 to 2.3.0
- 61790c6: Bump @sentry/node from 7.60.0 to 7.62.0
- e19a44a: Bump execa from 7.1.1 to 8.0.1
- 8de7bd7: Bump serialize-error from 11.0.0 to 11.0.1
- 450cb48: Bump @sentry/node from 7.69.0 to 7.70.0
- 7ee064c: Bump p-queue from 7.4.0 to 7.4.1
- b6a8c35: Bump which from 3.0.1 to 4.0.0
- b8b9810: Bump @sentry/node from 7.66.0 to 7.67.0
- e01a55b: Bump @sentry/node from 7.70.0 to 7.71.0
- 26b789a: Bump @oclif/plugin-warn-if-update-available from 2.0.45 to 2.0.49
- fa48fcf: Bump @sentry/node from 7.65.0 to 7.66.0
- 05bcd69: Bump @sentry/node from 7.72.0 to 7.73.0
- b84e537: Bump @sentry/node from 7.67.0 to 7.68.0
- 1f1b51a: Bump ws from 8.14.0 to 8.14.1
- 514fb8d: Bump ws from 8.13.0 to 8.14.0
- 7f1bdd3: Bump graphql-ws from 5.14.0 to 5.14.1
- 0fae690: Bump @oclif/plugin-warn-if-update-available from 2.0.44 to 2.0.45
- 27f19bf: Bump @sentry/node from 7.64.0 to 7.65.0
- ef16057: Bump p-queue from 7.3.4 to 7.4.0
- 0f39fc9: Bump inquirer from 9.2.8 to 9.2.10
- ea2c1b5: Bump @sentry/node from 7.68.0 to 7.69.0
- 6f5ef1a: Bump graphql from 16.7.1 to 16.8.0
- 6921231: Bump ws from 8.14.1 to 8.14.2
- eef1f4a: Bump @oclif/plugin-not-found from 2.3.32 to 2.4.0
- fb2626a: Bump @swc/helpers from 0.5.1 to 0.5.2
- ebcecc8: Bump @oclif/core from 2.14.0 to 2.15.0
- 02829e8: Bump @swc/helpers from 0.5.2 to 0.5.3
- 18fee1d: Bump @oclif/plugin-warn-if-update-available from 2.0.49 to 2.0.50
- 8dda978: Bump @oclif/plugin-warn-if-update-available from 2.0.50 to 2.1.0
- d570f4c: Bump @oclif/plugin-not-found from 2.4.1 to 2.4.3
- 3c9b37b: Bump @oclif/plugin-not-found from 2.4.0 to 2.4.1
- 3efb826: Bump serialize-error from 11.0.1 to 11.0.2
- 24072e1: change(ignorePaths): .DS_Store is ignored from syncing with Gadget

## 0.2.3

### Patch Changes

- 66f4641: Bump @sentry/node from 7.59.3 to 7.60.0
- f487b29: Bump @sentry/node from 7.59.2 to 7.59.3
- 459f72b: Bump @oclif/plugin-not-found from 2.3.31 to 2.3.32

## 0.2.2

### Patch Changes

- 4e5e350: Bump @oclif/core from 2.8.7 to 2.8.10
- 0a88335: Bump @sentry/node from 7.56.0 to 7.57.0
- b1aaacf: Bump @oclif/core from 2.8.10 to 2.8.11
- 5fc1913: Bump graphql from 16.7.0 to 16.7.1
- ad3913a: Bump @oclif/plugin-warn-if-update-available from 2.0.39 to 2.0.40
- 250f2ac: Bump @oclif/core from 2.9.2 to 2.9.3
- f5d333f: Bump @oclif/plugin-warn-if-update-available from 2.0.37 to 2.0.39
- 7c86212: Bump @sentry/node from 7.55.2 to 7.56.0
- 5d649c9: Bump chalk from 5.2.0 to 5.3.0
- 377dc1a: Bump @oclif/plugin-not-found from 2.3.29 to 2.3.31
- 05881a6: Bump @sentry/node from 7.58.1 to 7.59.2
- b8d37b0: Bump @oclif/plugin-warn-if-update-available from 2.0.40 to 2.0.41
- 20397d8: Bump @oclif/plugin-not-found from 2.3.28 to 2.3.29
- 0fb7ea2: Bump @oclif/core from 2.9.1 to 2.9.2
- 8c05c8c: Bump @oclif/plugin-not-found from 2.3.26 to 2.3.27
- f27c816: Bump @oclif/plugin-warn-if-update-available from 2.0.41 to 2.0.42
- ccc87f4: Bump @sentry/node from 7.57.0 to 7.58.1
- f8b41b2: Bump graphql-ws from 5.13.1 to 5.14.0
- 94b576a: Bump graphql from 16.6.0 to 16.7.0
- fb4ca33: Bump @oclif/core from 2.9.3 to 2.9.4
- 0481e16: Bump @oclif/core from 2.8.11 to 2.8.12
- 7724abc: Bump inquirer from 9.2.7 to 9.2.8
- 41fb29a: Bump @oclif/plugin-not-found from 2.3.25 to 2.3.26
- 49adf11: Bump @oclif/core from 2.8.12 to 2.9.1
- b110061: Bump @oclif/plugin-warn-if-update-available from 2.0.42 to 2.0.44
- c482369: Bump @oclif/plugin-not-found from 2.3.27 to 2.3.28
- ee23711: Improve sentry integration
  - Added sentry breadcrumbs to help debug on-going bugs.
  - Added ability to disable sentry via `GGT_SENTRY_ENABLED=false`

## 0.2.1

### Patch Changes

- 7c49ce0: Bump inquirer from 9.2.6 to 9.2.7
- 7af4337: Bump @sentry/node from 7.55.0 to 7.55.2
- 25d39e1: Bump get-port from 6.1.2 to 7.0.0
- 5ef3810: Bump @oclif/core from 2.8.6 to 2.8.7
- 72f7c9b: Bump @oclif/core from 2.8.5 to 2.8.6
- 7a46642: Bump @sentry/node from 7.54.0 to 7.55.0
- be2a30b: Bump @oclif/plugin-not-found from 2.3.24 to 2.3.25
- d7b8ce8: Support rename propagation when using file sync and switch to using `watcher` instead of `chokidar`

## 0.2.0

### Minor Changes

- 49a3918: Migrate to ESM

### Patch Changes

- 369b7f1: Bump chalk-template from 1.0.0 to 1.1.0
- d9f282a: Bump inquirer from 9.2.5 to 9.2.6
- 95c46cb: Bump got from 12.6.0 to 13.0.0
- bdfee22: Bump @sentry/node from 7.53.1 to 7.54.0
- 83bdf98: Bump graphql-ws from 5.13.0 to 5.13.1
- f9b8fdd: Bump @sentry/node from 7.51.2 to 7.52.1
- 7187955: Bump @oclif/plugin-not-found from 2.3.23 to 2.3.24
- dc1e708: Bump @sentry/node from 7.53.0 to 7.53.1
- 8020ee7: Build with `swc` instead of `tsc`
- d3fb0ba: Bump @sentry/node from 7.52.1 to 7.53.0
- 54f08f9: Bump @oclif/plugin-warn-if-update-available from 2.0.36 to 2.0.37
- 64c4d3e: Move local files to `.gadget/backup` instead of deleting them
- 98f472b: Save `.gadget/sync.json` during `ggt sync` instead of only on stop
- c90415d: We got access to the [`ggt`](https://www.npmjs.com/package/ggt) npm package! 🎉

  This changes our package.json's name to `ggt` so we can start using it. We're still going to publish new versions to `@gadgetinc/ggt` while we update our docs and give folks time to move over.

- 9cf42d2: Bump graphql-ws from 5.12.1 to 5.13.0

## 0.1.18

### Patch Changes

- 0fc7c7c: Bump @sentry/node from 7.51.0 to 7.51.2
- 0d6268e: Don't send parent directories back to Gadget

## 0.1.17

### Patch Changes

- c561a95: Bump @oclif/core from 2.8.2 to 2.8.5
- 60c99a5: Bump oclif from 3.8.1 to 3.8.2
- 47fc19b: Bump date-fns from 2.29.3 to 2.30.0
- 2ef1040: Bump @sentry/node from 7.48.0 to 7.49.0
- 18784ba: Bump which from 3.0.0 to 3.0.1
- 7614f50: Bump @oclif/plugin-warn-if-update-available from 2.0.35 to 2.0.36
- f5e1a3f: Improve the list command by

  - Prompting the user to log in if they aren't already (similar to `ggt sync`)
  - Linking them to `https://gadget.new` if they don't have any applications

- 02cbbae: Bump @oclif/plugin-plugins from 2.4.6 to 2.4.7
- e904319: Bump oclif from 3.8.2 to 3.9.0
- 0fcde51: Bump @sentry/node from 7.49.0 to 7.50.0
- cb585bd: Bump @oclif/plugin-plugins from 2.4.7 to 3.0.1
- d0c27ce: Rethrow all CLIErrors
- 53edf87: Bump @sentry/node from 7.50.0 to 7.51.0

## 0.1.16

### Patch Changes

- c9f6eca: Don't use `fs.readFile` on directories
- 77445c2: Don't include root directory in `getChangedFiles`

## 0.1.15

### Patch Changes

- 2709c05: Bump oclif from 3.7.3 to 3.8.0
- 7472fca: Bump oclif from 3.8.0 to 3.8.1
- 72bf09d: Bump @sentry/node from 7.47.0 to 7.48.0
- 85115cd: Bump @oclif/plugin-plugins from 2.4.4 to 2.4.6
- f497c08: Bump @oclif/core from 2.8.1 to 2.8.2
- 08367c7: Bump @oclif/plugin-warn-if-update-available from 2.0.33 to 2.0.35
- 61bbd23: Allow empty folders to be synced to gadget and vice versa
- 21bc98b: Bump ws from 8.12.1 to 8.13.0

## 0.1.14

### Patch Changes

- 136d6c8: Add a command for listing apps the user has access to
- ea7b71c: Bump @oclif/plugin-plugins from 2.3.2 to 2.4.4
- 7327c95: Fix `ggt sync` auto login feature
- 309d2fc: Bump @oclif/core from 2.8.0 to 2.8.1
- bb3f734: Bump @oclif/plugin-warn-if-update-available from 2.0.29 to 2.0.33
- a8a1102: Ignore `this.exit(0)` errors
- af964e2: Bump fs-extra from 11.1.0 to 11.1.1
- e249f63: Bump graphql-ws from 5.11.3 to 5.12.1
- 28531a0: Bump @oclif/plugin-not-found from 2.3.21 to 2.3.23
- b7ec027: Bump @sentry/node from 7.40.0 to 7.47.0
- 82821e7: Bump oclif from 3.7.0 to 3.7.3

## 0.1.13

### Patch Changes

- 61a5443: Upgrade oclif and @oclif/core to latest versions
- 43f14d5: Avoid high-cpu usage from overly-aggressive internal polling
- 8c80490: Bump ws from 8.12.0 to 8.12.1

## 0.1.12

### Patch Changes

- 2acf5cb: Bump @oclif/plugin-plugins from 2.1.12 to 2.2.2
- 98fb08f: Bump @oclif/core from 1.23.1 to 1.24.0
- 6502d06: Bump @oclif/core from 2.0.3 to 2.0.8
- 85f88f4: Bump @sentry/node from 7.36.0 to 7.37.0
- 0542418: Bump graphql-ws from 5.11.2 to 5.11.3
- 140f74a: Bump oclif from 3.4.6 to 3.6.3
- 1c5bb49: Bump @sentry/node from 7.29.0 to 7.30.0
- 55776ae: Bump @sentry/node from 7.31.1 to 7.36.0
- acdd074: Bump @sentry/node from 7.31.0 to 7.31.1
- 24c8bf3: Bump @oclif/plugin-not-found from 2.3.15 to 2.3.18
- 8df22f8: Bump @oclif/core from 2.0.8 to 2.0.11
- 793654f: Bump @oclif/plugin-plugins from 2.2.2 to 2.3.0
- 69aee46: Bump oclif from 3.4.3 to 3.4.6
- 486bd6b: Bump @oclif/core from 1.24.0 to 1.24.2
- 9cff790: Bump open from 8.4.0 to 8.4.1
- 9dbb4e4: Bump @oclif/plugin-warn-if-update-available from 2.0.18 to 2.0.19
- 0f07562: Bump @sentry/node from 7.30.0 to 7.31.0
- 6577b13: Bump @oclif/plugin-not-found from 2.3.13 to 2.3.14
- d3cc0c8: Bump @oclif/core from 1.24.2 to 2.0.3
- e504de2: Bump @oclif/plugin-warn-if-update-available from 2.0.19 to 2.0.26
- 58843b8: Bump ws from 8.11.0 to 8.12.0
- da60cc2: Bump @oclif/plugin-not-found from 2.3.14 to 2.3.15

## 0.1.11

### Patch Changes

- 0ed34ff: Bump json5 from 2.2.1 to 2.2.3

## 0.1.10

### Patch Changes

- ed20dad: Add color to non sync commands
- 77c79a9: Bump @oclif/plugin-plugins from 2.1.9 to 2.1.12
- 32f4fbe: Bump @oclif/plugin-not-found from 2.3.11 to 2.3.13
- 8d9e6d4: Bump @oclif/core from 1.22.0 to 1.23.1
- 43918ce: Improve sync output

  - Show the name and relevant links of the synced app
  - Inform the user that it's watching for file changes and how to stop it
  - Show whether a file was changed or deleted when sending/receiving it

- 319e16d: Bump @sentry/node from 7.28.1 to 7.29.0
- 3f350d8: Bump @oclif/plugin-warn-if-update-available from 2.0.17 to 2.0.18
- f71d6e3: Ignore `unlinkDir` events

## 0.1.9

### Patch Changes

- b474fb1: Bump concurrently from 7.5.0 to 7.6.0
- fcab81d: Bump prettier from 2.8.0 to 2.8.1
- f8eb274: Bump @oclif/test from 2.2.12 to 2.2.16
- d48d18d: Fixed `Files version mismatch` exception after reconnecting.
- b7e76de: Bump @changesets/cli from 2.25.2 to 2.26.0
- f19b40c: Bump typescript from 4.9.3 to 4.9.4
- 70fc6ce: Fix README's ci badge
- 2a13da9: Bump @types/node from 18.11.9 to 18.11.17
- 8eb58ad: Bump jest from 29.3.0 to 29.3.1
- 1d332f2: Bump @types/lodash from 4.14.190 to 4.14.191
- 5dfc2bb: Bump @oclif/plugin-plugins from 2.1.7 to 2.1.9
- 608bd07: Bump @swc/jest from 0.2.23 to 0.2.24
- 6d48d38: Bump @graphql-codegen/typescript-operations from 2.5.7 to 2.5.10
- aef502a: Bump ignore from 5.2.0 to 5.2.1
- 28087bd: Bump @oclif/plugin-not-found from 2.3.8 to 2.3.9
- 7ad9be4: Bump eslint-plugin-jest from 27.1.5 to 27.1.7
- 06cbe3c: Bump @sentry/node from 7.28.0 to 7.28.1
- 09de344: Bump fs-extra from 10.1.0 to 11.1.0
- 0969f31: Bump @graphql-codegen/add from 3.2.1 to 3.2.3
- a0272f7: Bump @typescript-eslint/eslint-plugin from 5.44.0 to 5.47.0
- 7f658c0: Bump @swc/core from 1.3.19 to 1.3.24
- 6b6c7af: Bump type-fest from 3.3.0 to 3.4.0
- 972e338: Bump cspell from 6.14.3 to 6.18.0
- 5b15d24: Bump oclif from 3.2.28 to 3.4.2
- f8af46b: Bump @sentry/node from 7.20.0 to 7.28.0
- b89c0c1: Bump @oclif/plugin-warn-if-update-available from 2.0.14 to 2.0.17
- 8adda53: Bump ignore from 5.2.1 to 5.2.4
- b4e50ba: Render error message before sending exception to Sentry
- 802d026: Bump @typescript-eslint/parser from 5.45.1 to 5.47.0
- f63b682: Bump @graphql-codegen/cli from 2.13.11 to 2.16.1
- c12b51b: Bump eslint from 8.27.0 to 8.30.0

## 0.1.8

### Patch Changes

- 06ab881: Bump @oclif/plugin-warn-if-update-available from 2.0.13 to 2.0.14
- f99aa6f: Bump @sentry/node from 7.18.0 to 7.20.0
- fe6b720: Bump oclif from 3.2.25 to 3.2.27
- 2ebdeb7: Use `.ignore` to ignore incoming changes as well
- c47b0e9: Bump oclif from 3.2.27 to 3.2.28
- 3c3a9b4: Clean up error messages and add tests

## 0.1.7

### Patch Changes

- a39391b: Only print the invalid directory once
- 727f3e7: Print link to `bug_report.yml` instead of pre-filled issue

## 0.1.6

### Patch Changes

- 756a8a3: Fix `isGraphQLErrors` check to handle missing `locations` or `path`
- 4a95908: Use base64 encoding to send/receive file content
