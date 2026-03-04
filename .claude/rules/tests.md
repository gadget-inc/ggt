---
paths:
  - "spec/**"
---

# Test Infrastructure

Tests live in `spec/` (mirroring `src/`) using Vitest. Setup in `spec/vitest.setup.ts` runs before every test.

## Global setup (do not re-mock)

- `GGT_ENV` stubbed to `"test"` via `vi.stubEnv`
- Test directory `tmp/spec/<test-path>/` created and emptied each test
- `testCtx` — fresh `Context` (aborted on cleanup), import from `__support__/context.js`
- stdout captured automatically — read with `expectStdout()` from `__support__/output.js`
- Config dirs (`config.configDir`, `cacheDir`, `dataDir`) point to test tmp dirs
- `packageJson.version` fixed to `"1.2.3"`; `config.versionFull` fixed to a stable string
- Nock: `nock.cleanAll()` before each test; **pending mocks asserted on cleanup**
- Side-effect mocks: `execa`, `get-port`, `node-notifier`, `open`, `which`, `simple-git`
- `process.exit` mocked to **throw** — always wrap with `expectProcessExit(fn, code)`
- Memoization cleared between tests via `clearMemoized()`
- JSON extensions installed/uninstalled each test

## Utilities

All imports are from `spec/__support__/`.

### Setting up a test

- **testCtx** (context) — pre-initialized `Context` for passing to commands/services
- **makeArgs(args, ...argv)** (arg) — parse CLI argv into typed args, e.g. `makeArgs(push.args, "push", "--force")`
- **makeRootArgs(...argv)** (arg) — parse root-level args only
- **loginTestUser()** (user) — nock `/auth/api/current-user` with cookie or token auth (randomly chosen). Use `loginTestUserWithToken` / `loginTestUserWithCookie` when you need a specific auth method.
- **matchAuthHeader** (user) — mutable export set by `loginTestUser`; use to add auth matching to custom nock interceptors
- **nockTestApps()** (app) — nock the `/auth/api/apps` endpoint (optional + persistent by default)
- **testApp**, **testApp2** (app) — frozen test `Application` objects
- **testEnvironment** (app) — first environment of `testApp`
- **testUser** (user) — frozen test `User` object

### Working with files

- **writeDir(dir, files)** (files) — write a `Files` map to disk; keys ending in `"/"` create directories
- **readDir(dir)** (files) — read directory into a `Files` map
- **expectDir(dir, expected)** (files) — assert directory contents match a `Files` map
- **testDirPath(...segments)** (paths) — absolute path under `tmp/spec/<current-test>/`
- **appFixturePath(...segments)** (paths) — absolute path to `spec/__fixtures__/app/`

The `Files` type is `Record<string, string>`. Directory entries use trailing `"/"` with `""` value: `{ ".gadget/": "", "file.txt": "content" }`.

### Mocking HTTP/GraphQL

- **nockEditResponse(opts)** (graphql) — nock a query/mutation on `/edit/api/graphql`
- **nockApiResponse(opts)** (graphql) — nock a query/mutation on `/api/graphql`
- **makeMockEditSubscriptions()** (graphql) — mock `Client.subscribe`, returns `{ expectSubscription, getAllSubscriptions }`

`nockEditResponse` accepts `response` as a static object or `(variables) => response` function. Use `expectVariables` with a Zod schema for validation. See `__support__/graphql.ts` for additional exports.

### File sync tests

- **makeSyncScenario(opts)** (filesync) — set up local dir, gadget dir, filesync instance, and all nocked GraphQL. Returns `{ localDir, gadgetDir, filesync, expectDirs, emitGadgetChanges, ... }`
- **makeHashes(opts)** (filesync) — create hashes from `Files` maps for lower-level hash tests
- **makeFile(opts)** (filesync) — create a `File` object with defaults
- **expectSyncJson(filesync, expected?)** (filesync) — assert sync.json state matches; returns pretty JSON for snapshot comparison
- **expectPublishVariables(expected)** (filesync) — returns a Zod schema that sorts and validates publish mutation variables

See `__support__/filesync.ts` for additional exports.

### Assertions & output

- **expectStdout()** (output) — returns a vitest `Assertion` on captured stdout; chain `.toMatchInlineSnapshot()`
- **expectStderr()** (output) — same for stderr; **requires calling `mockStderr()` first at module level** (not inside `beforeEach`)
- **mockStderr()** (output) — opt in to stderr capture (not automatic like stdout); call at module level
- **expectProcessExit(fn, code?)** (process) — wrap a function expected to call `process.exit()`
- **expectError(fn)** (error) — wrap a function expected to throw; returns the error
- **expectReportErrorAndExit(cause, fn)** (error) — assert `reportErrorAndExit` is called with given cause
- **waitForReportErrorAndExit(cause)** (error) — wait for an eventual `reportErrorAndExit` call; use for fire-and-forget async flows (e.g. `void root.run(...)` then `await waitForReportErrorAndExit(error)`)

### Mocking functions & prompts

- **mock(target, prop, impl)** (mock) — spy + replace implementation (restores any prior mock first). Also supports getter/setter overloads: `mock(target, prop, "get", impl)` and `mock(target, prop, "set", impl)`
- **mockOnce(target, prop, impl)** (mock) — same but only for one call
- **mockRestore(fn)** (mock) — restore a mock to original (no-op if not mocked)
- **mockConfirm(answer?)** / **mockConfirmOnce(answer?)** (mock) — mock `confirm()`, default `true`
- **mockSelect(choice)** / **mockSelectOnce(choice)** (mock) — mock `select()` to return `choice`

### Other helpers

- **sleep(duration)** (sleep) — async sleep, e.g. `sleep("1s")`
- **timeoutMs(duration)** (sleep) — duration to ms (doubled in CI, Infinity under debugger)
- **withEnv(env, fn)** (env) — temporarily set env vars for the duration of `fn`
- **mockSystemTime()** (time) — fake `Date` to epoch 0; **call at module level**, not inside a test (registers its own hooks)
- **log** (debug) — test-scoped logger for debugging

## Common patterns

### Command test

```typescript
import { beforeEach, describe, it } from "vitest";
import * as push from "../../src/commands/push.js";
import { nockTestApps } from "../__support__/app.js";
import { makeArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { loginTestUser } from "../__support__/user.js";

describe("push", () => {
  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  it("pushes local files to gadget", async () => {
    const { localDir, expectDirs } = await makeSyncScenario({
      localFiles: { ".gadget/": "" },
    });

    await push.run(testCtx, makeArgs(push.args));

    await expectDirs().resolves.toMatchInlineSnapshot(`...`);
  });
});
```

### Nocking a GraphQL response

```typescript
import { z } from "zod";
import { SOME_QUERY } from "../../src/services/app/edit/operation.js";
import { nockEditResponse } from "../__support__/graphql.js";

nockEditResponse({
  operation: SOME_QUERY,
  expectVariables: z.object({ id: z.string() }),
  response: (variables) => ({
    data: { someQuery: { id: variables.id, name: "test" } },
  }),
});
```

## Gotchas

- **Nock pending mocks** — global teardown asserts `nock.pendingMocks()` is empty. Unused interceptors fail the test on cleanup. Use `optional: true` for interceptors that may not be hit.
- **process.exit throws** — mocked to throw by default. Unwrapped `process.exit()` calls fail with "process.exit was called unexpectedly". Always use `expectProcessExit(fn, code)`.
- **vi.mock hoisting** — `vi.mock()` is hoisted; you can't reference same-file variables inside it. Use `vi.hoisted()` or inline values. Check `mockSideEffects()` in global setup before adding your own.
- **Snapshot updating** — prefer `toMatchInlineSnapshot()`. Update with `pnpm test -u` or `u` in watch mode.
- **vi.waitFor for polling** — use `vi.waitFor(fn, { timeout, interval })` for async conditions. `timeoutMs()` adjusts for CI/debugger.
- **`mockContext()`/`mockStdout()` re-registration** — some test suites call `mockContext()` at describe level to get their own context lifecycle. When doing this, also call `mockStdout()` at the same describe level to maintain proper hook ordering. Both must be called at module/describe level, not inside `beforeEach`.

Integration tests: see CONTRIBUTING.md.
