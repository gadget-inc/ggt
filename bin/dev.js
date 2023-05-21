#!/usr/bin/env node --loader ts-node/esm --no-warnings

import path from "node:path";
import url from "node:url";
import process from "node:process";
import oclif from "@oclif/core";

const workspaceRoot = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..");

process.env.NODE_ENV = "development";
process.env.GGT_ENV ??= "development";

// store files in the project's tmp directory
// https://github.com/oclif/core/blob/503e263f1c224fb2b2e28538975e4d5e0a5d2028/src/config/config.ts#L155
process.env["GGT_CONFIG_DIR"] = path.join(workspaceRoot, "tmp", "config");
process.env["GGT_CACHE_DIR"] = path.join(workspaceRoot, "tmp", "cache");
process.env["GGT_DATA_DIR"] = path.join(workspaceRoot, "tmp", "data");

process.on("unhandledRejection", oclif.Errors.handle);

oclif
  .run(process.argv.slice(2), import.meta.url)
  .then(oclif.flush)
  .catch(oclif.Errors.handle);
