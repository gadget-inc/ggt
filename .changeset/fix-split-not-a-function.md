---
"ggt": patch
---

Fix "e.split is not a function" error in environment logs.

Handle non-string msg values in formatMessage() by converting to string before calling .split(). Environment logs from the server can have missing or non-string msg fields.
