---
paths:
  - "src/services/filesync/**"
  - "spec/services/filesync/**"
---

# File Synchronization

## Key classes

- `FileSync` (`filesync.ts`) — orchestrates sync: merge, push, pull, subscribe to changes
- `SyncJson` (`sync-json.ts`) — persists sync state to `.gadget/sync.json`, tracks `filesVersion` and app identity
- `Directory` (`directory.ts`) — file walking, hashing, ignore rules, path normalization
- `Changes` (`changes.ts`) — `Map<string, Change>`, tracks create/update/delete
- `ChangesWithHash` (`hashes.ts`) — `Map<string, ChangeWithHash>`, changes with source/target hashes
- `Conflicts` (`conflicts.ts`) — `Map<string, { localChange, gadgetChange }>`, conflicting file changes
- `File` (`file.ts`) — `{ path, mode, content, encoding, oldPath? }`, a single synced file

## Constants

- `MAX_MERGE_ATTEMPTS` = 10
- `MAX_PUSH_ATTEMPTS` = 10
- `MAX_PUSH_CONTENT_LENGTH` = 50 MB

## Ignore patterns

- `NEVER_IGNORE_PATHS` (`.gadget/`) — always synced, even if in `.ignore`
- `ALWAYS_IGNORE_PATHS` (`.DS_Store`, `node_modules`, `.git`, `.shopify`) — never synced
- `HASHING_IGNORE_PATHS` (`.gadget/sync.json`, `.gadget/dev-lock.json`, `.gadget/backup`, `yarn-error.log`) — excluded from hash calculations only

User-defined ignores come from a `.ignore` file (gitignore syntax) in the sync directory.

## Hash-based change detection

Three-way comparison using `getNecessaryChanges()` from `hashes.ts`:

1. **Local at last sync** — hashes at the `filesVersion` stored in `sync.json`
2. **Local current** — hashes of files on disk
3. **Remote current** — hashes from the Gadget environment

Changes are computed as diffs: `localChanges = diff(localAtLastSync, localCurrent)`, `environmentChanges = diff(localAtLastSync, remoteCurrent)`.

`.gadget/` files are always ignored in local changes (Gadget is the source of truth for these).

## Conflict resolution

1. Detect conflicts — same path changed on both sides with different content
2. Auto-resolve `.gadget/` conflicts — always use environment's version
3. Prompt user with `MergeConflictPreference`: `"Keep local"` / `"Keep environment's"` / `"Cancel"`

## Operation queue

`FileSync` uses a `PQueue` with `concurrency: 1` to ensure sync operations (push, pull, merge, subscription events) are processed in FIFO order.

## `filesVersion` tracking

Every sync operation uses `filesVersion` (a `bigint`) for optimistic concurrency. Pushes send `expectedRemoteFilesVersion`; a mismatch triggers a merge retry loop (up to `MAX_MERGE_ATTEMPTS`).

## Gotchas

- **`directory.ts` is shared** — the `DO NOT MODIFY` comment means this file is kept in sync with the main Gadget repo. Changes here must be coordinated.
- **`.gadget/` special casing** — local changes to `.gadget/` are always ignored during push. Environment changes to only `.gadget/` files are treated as "no visible change" to the user.

**Key files:** `filesync.ts`, `directory.ts`, `hashes.ts`, `conflicts.ts`, `sync-json.ts`
