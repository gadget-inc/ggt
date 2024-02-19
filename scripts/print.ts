#!/usr/bin/env -S FORCE_COLOR=0 SWCRC=true SWC_NODE_PROJECT=./tsconfig.json node --loader @swc-node/register/esm --no-warnings

import { setTimeout } from "node:timers/promises";
import { println } from "../src/services/output/print.js";

println({ output: "sticky" })`
    Hello world! 👋
`;

await setTimeout(1_000);

println({ output: "sticky" })`
    Doing some work...
`;

await setTimeout(1_000);
println("first line");

await setTimeout(1_000);
println("second line");

await setTimeout(1_000);
println({ output: "sticky" })`
    Done!
`;
