#!/usr/bin/env node --loader @swc-node/register/esm --no-warnings

import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

process.env["NODE_ENV"] ??= "development";
process.env["GGT_ENV"] ??= "development";
process.env["GGT_SENTRY_ENABLED"] ??= "false";
process.env["GGT_CONFIG_DIR"] ??= join(workspaceRoot, "tmp/config");
process.env["GGT_CACHE_DIR"] ??= join(workspaceRoot, "tmp/cache");
process.env["GGT_DATA_DIR"] ??= join(workspaceRoot, "tmp/data");

await import("../src/main.js");
