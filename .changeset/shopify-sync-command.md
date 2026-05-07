---
"ggt": minor
---

Add `ggt shopify sync` to start Shopify data syncs for installed shops.

The command supports `--store`, `--shop-ids`, `--models`, and `--since`
filters.

Examples:

```sh
ggt shopify sync
ggt shopify sync --store mystore.myshopify.com
ggt shopify sync --shop-ids 1,2,3
ggt shopify sync --models shopifyProduct,shopifyOrder
ggt shopify sync --since 2024-01-01
```
