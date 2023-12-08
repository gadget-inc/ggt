#!/usr/bin/env node --loader @swc-node/register/esm --no-warnings

import { $ } from "execa";
import process from "node:process";
import { workspaceRoot } from "../src/services/config/paths.js";
import { parseBoolean } from "../src/services/util/boolean.js";

try {
  process.chdir(workspaceRoot);
  await $`npm run build`;
  await $`npm install --omit=dev`;
  await $({ stdio: "inherit", shell: true })`du -sh node_modules/* assets/* bin/ lib/ | grep -v '^0' | sort -h`;
} finally {
  if (!parseBoolean(process.env["CI"])) {
    // re-install dev dependencies
    await $`npm install`;
  }
}