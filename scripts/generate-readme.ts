#!/usr/bin/env node --loader=ts-node/esm --no-warnings

import { $ } from "execa";
import fs from "fs-extra";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkToc from "remark-toc";
import { dedent } from "ts-dedent";
import { usage } from "../src/commands/root.js";
import { Commands, importCommand } from "../src/services/command/command.js";
import { Context } from "../src/services/command/context.js";

const ctx = Context.init({ name: "readme" });
let readme = await fs.readFile("README.md", "utf8");

readme = readme.replace(
  /^## Usage.*?(^## )/ms,
  dedent`
    ## Usage

    \`\`\`sh-session
    $ npm install -g ggt
    $ ggt
    ${usage(ctx)}
    \`\`\`

    $1
  `,
);

const commands: string[] = [];
for (const name of Commands) {
  const cmd = await importCommand(name);
  commands.push(dedent`
    ### \`ggt ${name}\`

    \`\`\`sh-session
    $ ggt ${name} -h
    ${cmd.usage(ctx)}
    \`\`\`
  `);
}

readme = readme.replace(
  /## Commands.*$/s,
  dedent`
    ## Commands

    ${commands.join("\n\n")}
  `,
);

const file = await remark().use(remarkGfm).use(remarkToc, { tight: true }).process(readme);
await fs.writeFile("README.md", String(file));
await $`npx prettier -w README.md`;
