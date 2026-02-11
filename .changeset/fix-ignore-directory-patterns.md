---
"ggt": patch
---

Fix `.ignore` directory-only patterns (trailing slash) not working

Patterns like `.husky/` in the `.ignore` file now correctly match directories,
matching `.gitignore` behavior. Previously, only patterns without trailing
slashes (e.g., `.husky`) would work.
