#!/usr/bin/env -S SWCRC=true SWC_NODE_PROJECT=./tsconfig.json node --loader @swc-node/register/esm --no-warnings

import assert from "node:assert";
import { setTimeout as sleep } from "node:timers/promises";
import { confirm } from "../src/services/output/confirm.js";
import { footer } from "../src/services/output/footer.js";
import { println } from "../src/services/output/print.js";
import { select } from "../src/services/output/select.js";
import { spin } from "../src/services/output/spinner.js";

footer({ ensureEmptyLineAbove: true })`
  👆 Watch this.
`;

await sleep(1_000);
await confirm`
  {bold Are you ready?}
`;

await sleep(1_000);
println({ ensureEmptyLineAbove: true })`
  👋 Hello world!
`;

await sleep(1_000);
println({ ensureEmptyLineAbove: true })`
  👀 Time to get my things!
`;

let spinner = spin({ successSymbol: "🤗" })`
  Getting my first thing...
`;

await sleep(1_000);
spinner.succeed("Got my first thing!");

spinner = spin({ failSymbol: "😭" })`
  Getting my second thing...
`;

await sleep(1_000);
spinner.fail("Failed to get my second thing!");

const choices = ["Yeah!", "Meh", "No."];
const choice = await select({ choices, ensureEmptyLineAbove: true, indent: 2 })`
  Wasn't that cool?
`;

assert(choices.includes(choice), "invalid choice");
