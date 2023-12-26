#!/usr/bin/env node --loader @swc-node/register/esm --no-warnings

import process from "node:process";
import { ggt } from "../src/ggt.js";
import { workspacePath } from "../src/services/util/paths.js";

process.env["NODE_ENV"] ??= "development";
process.env["GGT_ENV"] ??= "development";
process.env["GGT_SENTRY_ENABLED"] ??= "false";
process.env["GGT_CONFIG_DIR"] ??= workspacePath("tmp/config");
process.env["GGT_CACHE_DIR"] ??= workspacePath("tmp/cache");
process.env["GGT_DATA_DIR"] ??= workspacePath("tmp/data");

await ggt();
