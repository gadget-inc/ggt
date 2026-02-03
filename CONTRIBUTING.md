# Contributing to ggt

Contributions are welcomed! Contributors must adhere to our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Getting Started

### Prerequisites

- [Nix](https://nixos.org/download)
- [direnv](https://direnv.net/)

### Setup

1. Install the prerequisites above.
2. Clone and enter the repository.
3. Run `direnv allow` – direnv will automatically enter the `nix develop` shell.
4. Run `pnpm install` to install dependencies.

## Project Layout

```
.changeset/       → Changeset files for releases
dist/             → Build output (generated)
scripts/          → Developer tooling
spec/             → Tests (mirrors src/ structure)
  __fixtures__/   → Sample app fixtures
  __support__/    → Test utilities
src/              → Source code
  __generated__/  → Generated GraphQL types
  commands/       → CLI commands (dev, deploy, push, pull, etc.)
  services/       → Core services (filesync, app, output, etc.)
```

## Development

### Building

```bash
pnpm run build          # Build once
pnpm run dev            # Build + test in watch mode
```

### Running ggt

After building, run `ggt` directly:

```bash
ggt whoami              # Check login status
ggt dev                 # Start file sync
ggt --help              # See all commands
```

### ggt vs dggt

The Nix development shell provides two wrapper commands defined in [`nix/flake.nix`](./nix/flake.nix):

- **`ggt`** — Runs `dist/main.js` with `GGT_ENV=production` (connects to production Gadget)
- **`dggt`** — Runs `dist/main.js` with `GGT_ENV=development` (connects to development Gadget, for Gadget staff)

Both commands reference `$WORKSPACE_ROOT/dist/main.js`, which is set by [`.envrc`](./.envrc) when direnv loads. This means you must build first (`pnpm run build`) before the commands will work.

> [!NOTE]
> **Gadget Staff:** You'll also need `mkcert` for local development certificates.

> [!TIP]
>
> - Use `pnpm run build:watch` to continuously rebuild on file changes, so `ggt`/`dggt` always have fresh output. Alternatively, `pnpm run dev` runs both `build:watch` and `test:watch` in parallel.
> - When working on file sync, use `tmp/apps/` as your sync directory to keep synced files separate from `ggt` source code.

<details>
<summary><strong>Environment Variables</strong></summary>

| Variable                     | Description                                           | Default                                  |
| ---------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| `GGT_ENV`                    | Environment (`production` or `development`)           | `production`                             |
| `GGT_LOG_LEVEL`              | Log level (`trace`, `debug`, `info`, `warn`, `error`) | none                                     |
| `GGT_LOG_FORMAT`             | Log format (`pretty` or `json`)                       | `pretty`                                 |
| `GGT_SESSION`                | API session token                                     | Contents of `GGT_CONFIG_DIR/session.txt` |
| `GGT_GADGET_APP_DOMAIN`      | Gadget API domain                                     | `gadget.app`                             |
| `GGT_GADGET_SERVICES_DOMAIN` | Gadget Services domain                                | `app.gadget.dev`                         |
| `GGT_CONFIG_DIR`             | Config directory                                      | `~/.config/ggt` (Unix)                   |
| `GGT_CACHE_DIR`              | Cache directory                                       | `~/Library/Caches/ggt` (macOS)           |
| `GGT_DATA_DIR`               | Data directory                                        | `~/.local/share/ggt` (Unix)              |
| `GGT_SENTRY_ENABLED`         | Enable error reporting                                | `true`                                   |

Use `-v` for verbose output (`-vv` for debug, `-vvv` for trace).

</details>

## Testing

Tests live in `spec/` and use [Vitest](https://vitest.dev/):

```bash
pnpm test                       # Run all tests
pnpm test spec/commands/dev     # Run specific test file
pnpm test -t "test name"        # Run test by name
```

### Test Isolation

Each test gets its own directory in `tmp/spec/<test-name>/` for temporary files. This isolation allows tests to run in parallel without interfering with each other. The setup in `spec/vitest.setup.ts` handles directory creation, cleanup, and global mocking automatically.

### Test Utilities

The `spec/__support__/` directory provides utilities for common test scenarios:

| Utility              | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `testCtx`            | Pre-initialized `Context` available in every test |
| `makeArgs()`         | Parse command-line arguments for testing commands |
| `loginTestUser()`    | Set up authenticated user session                 |
| `nockTestApps()`     | Mock the apps API endpoint                        |
| `nockEditResponse()` | Mock GraphQL edit responses                       |
| `makeSyncScenario()` | Create a complete file sync test environment      |
| `expectDir()`        | Assert directory contents match expected files    |

### Example Test

Here's a basic test pattern for command tests:

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
    const { localDir } = await makeSyncScenario({
      localFiles: { ".gadget/": "" },
    });

    // ... add files to localDir ...

    await push.run(testCtx, makeArgs(push.args));
  });
});
```

## Linting

```bash
pnpm run lint           # Run all linters
pnpm run lint:fix       # Auto-fix issues
```

## Pull Requests

1. Open a pull request against the `main` branch
2. Ensure all tests pass
3. Add a changeset if the change warrants a new version

### Creating a Changeset

Create a changeset using the interactive command:

```bash
pnpm changeset
```

Or create a markdown file manually in `.changeset/` with a descriptive name (e.g., `.changeset/add-logout-command.md`):

```md
---
"ggt": patch
---

Concise title of the change

Optional longer description explaining the change in more detail.
```

**Version types:**

- `patch` — Bug fixes
- `minor` — New features (backwards compatible)
- `major` — Breaking changes

> [!NOTE]
> Skip changesets for documentation-only changes, test-only changes, or internal refactors that don't affect the published package.

## Releasing

ggt uses [Changesets](https://github.com/changesets/changesets) and GitHub Actions to publish to npm.

When PRs with changesets are merged to `main`, the Changesets GitHub Action automatically opens (or updates) a "Release" PR. This PR bumps the version in `package.json`, updates `CHANGELOG.md`, and removes consumed changeset files. Merge the Release PR to publish to npm.

### Experimental Releases

To publish an experimental version:

```bash
./scripts/publish-experimental.ts
```

Install with `npm install -g ggt@experimental`.

## Contribution Workflow

1. Fork and clone the repository
2. Create a feature branch
3. Make your changes
4. Run `pnpm run lint:fix` to fix formatting
5. Run `pnpm test` to ensure tests pass
6. Add a changeset if needed
7. Open a pull request
