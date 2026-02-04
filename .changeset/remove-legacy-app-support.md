---
"ggt": patch
---

Remove deprecated pre-v1 (non multi-environment) app support

All Gadget apps now have multi-environment support enabled, so this removes the legacy
`hasSplitEnvironments` and `multiEnvironmentEnabled` flags and simplifies the related
conditional logic for subdomain routing and environment selection.

Also removes the deprecated `--prefer=gadget` option (use `--prefer=environment` instead).
