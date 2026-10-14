---
"ggt": minor
---

Ignore git worktrees nested inside the synced folder

Tools like Claude Code, Cursor, Conductor, and Codex create git worktrees inside your app folder. ggt now detects them (a folder whose `.git` file points into a repository's `worktrees/` directory) and never syncs them, so a worktree's copy of your app is no longer pushed to your environment. Copies already synced to your environment are left alone and are never pulled over your worktree's files.
