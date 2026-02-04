#!/usr/bin/env node

// Enable source maps for better error stack traces
// Must be called before importing any modules so all stack traces are mapped
process.setSourceMapsEnabled(true);

const { ggt } = await import("./ggt.js");
await ggt();
