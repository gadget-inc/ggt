---
ggt: "minor"
---

Dropped support for downgrading to ggt v0.4.x

ggt v1.1.x will no longer output a `.gadget/sync.json` file that is compatible with ggt v0.4.x. This means local directories that are synced with ggt v1.1.x will no longer be able to be synced with ggt v0.4.x. This change was made to simplify and reduce the complexity of the codebase.
