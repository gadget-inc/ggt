#!/usr/bin/env -S SWCRC=true SWC_NODE_PROJECT=./tsconfig.json node --loader @swc-node/register/esm --no-warnings

import { $ } from "execa";
import fs from "fs-extra";
import { packageJson } from "../src/services/config/package-json.js";
import { println } from "../src/services/output/print.js";
import { spin } from "../src/services/output/spinner.js";
import { workspacePath } from "../src/services/util/paths.js";

const status = await $`git status --porcelain`;
if (status.stdout.trim() !== "") {
  println`
    You have uncommitted changes

    Please commit or stash them before publishing
  `;

  process.exit(1);
}

let spinner = spin("Installing dependencies");
await $`npm install`;
spinner.succeed();

spinner = spin("Linting");
await $`npm run lint`;
spinner.succeed();

spinner = spin("Testing");
await $`npm run test`;
spinner.succeed();

spinner = spin("Building");
await $`npm run build`;
spinner.succeed();

try {
  const gitSha = await $`git rev-parse --short HEAD`;
  packageJson.version = `0.0.0-experimental.${gitSha.stdout.trim()}`;
  await fs.writeJSON(workspacePath("package.json"), packageJson, { spaces: 2 });

  println({ ensureEmptyLineAbove: true })("Publishing experimental release:");
  await $({ stdio: "inherit" })`npm publish --tag=experimental`;
} finally {
  // undo changes to package.json
  await $`git checkout package.json`;
}
