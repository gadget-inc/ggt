# @gadgetinc/ggt

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
