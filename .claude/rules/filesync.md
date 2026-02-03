---
globs: src/services/filesync/**
---

# File Synchronization

The `FileSync` class (`src/services/filesync/filesync.ts`) handles:

- Hash-based change detection between local and remote
- Conflict detection and resolution
- GraphQL subscriptions for real-time sync
- Merge strategies when both sides have changes
