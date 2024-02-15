#!/usr/bin/env -S SWCRC=true SWC_NODE_PROJECT=./tsconfig.json node --loader @swc-node/register/esm --no-warnings

import { $ } from "execa";
import fs from "fs-extra";
import { oraPromise } from "ora";
import { packageJson } from "../src/services/config/package-json.js";
import { createLogger } from "../src/services/output/log/logger.js";
import { workspacePath } from "../src/services/util/paths.js";

const log = createLogger({ name: "publish-experimental" });

const status = await $`git status --porcelain`;
if (status.stdout.trim() !== "") {
  log.println`
    You have uncommitted changes

    Please commit or stash them before publishing
  `;

  process.exit(1);
}

await oraPromise($`npm install`, "Installing dependencies");
await oraPromise($`npm run lint`, "Linting");
await oraPromise($`npm run test`, "Testing");
await oraPromise($`npm run build`, "Building");

try {
  const gitSha = await $`git rev-parse --short HEAD`;
  packageJson.version = `0.0.0-experimental.${gitSha.stdout.trim()}`;
  await fs.writeJSON(workspacePath("package.json"), packageJson, { spaces: 2 });

  log.println({ marginTop: 1 })("Publishing experimental release:");
  await $({ stdio: "inherit" })`npm publish --tag=experimental`;
} finally {
  // undo changes to package.json
  await $`git checkout package.json`;
}
