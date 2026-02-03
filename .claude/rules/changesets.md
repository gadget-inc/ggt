# Changesets

PRs that require a new version to be published must include a changeset.

## Creating a Changeset

Create a markdown file in `.changeset/` with a random name (e.g., `.changeset/fuzzy-lions-dance.md`):

```md
---
"ggt": patch
---

Concise title of the change

Optional longer description explaining the change in more detail,
including context, motivation, or any breaking change notes.
```

## Version Types

- `patch`: Bug fixes
- `minor`: New features (backwards compatible)
- `major`: Breaking changes

Skip changesets for documentation-only changes, test-only changes, or internal refactors that don't affect the published package.
