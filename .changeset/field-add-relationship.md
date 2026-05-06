---
"ggt": minor
---

Add `--to`, `--through`, and `--inverse-field` flags to `ggt field add` for
creating relationship fields. `--to` is required for any relationship type,
`--through` is required for `:hasManyThrough`, and `--inverse-field` overrides
the auto-generated inverse field name on the related model.

```sh
ggt field add post/author:belongsTo --to user
ggt field add user/posts:hasMany --to post
ggt field add post/tags:hasManyThrough --to tag --through postTag
```
