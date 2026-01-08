---
"ggt": patch
---

Retry HTTP requests on SSL/TLS errors.

All HTTP requests will now automatically retry when encountering transient SSL/TLS errors like `ERR_SSL_SSL/TLS_ALERT_BAD_RECORD_MAC` or `EPROTO`. This improves resilience against transient network issues that can occur during SSL/TLS handshakes.
