---
paths:
  - "src/**"
  - ".changeset/**"
---

# Changesets

Every user-facing change (bug fix, new feature, breaking change) MUST include a changeset file. Create one with `pnpm changeset` or manually in `.changeset/` with a descriptive kebab-case name.

Version types: `patch` (bug fixes), `minor` (new features), `major` (breaking changes).

Skip changesets for documentation-only changes, test-only changes, internal refactors, and rules/config file updates that don't affect the published package.
