---
"ggt": minor
---

Add `ggt shopify sync` to start Shopify data syncs for installed shops.

The command supports `--store`, `--shop-ids`, `--models`, `--since`, and
`--last` filters. By default, syncs the last 10 records per Shopify model;
use `--all` to sync all matching records.

Examples:

```sh
ggt shopify sync
ggt shopify sync --store mystore.myshopify.com
ggt shopify sync --shop-ids 1,2,3
ggt shopify sync --models shopifyProduct,shopifyOrder
ggt shopify sync --since 2024-01-01
ggt shopify sync --last 50
ggt shopify sync --all
```
