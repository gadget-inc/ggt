#!/usr/bin/env -S FORCE_COLOR=0 SWCRC=true SWC_NODE_PROJECT=./tsconfig.json node --loader @swc-node/register/esm --no-warnings

import { $ } from "execa";
import fs from "fs-extra";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkToc from "remark-toc";
import { dedent } from "ts-dedent";
import { usage } from "../src/commands/root.js";
import { Commands, importCommand } from "../src/services/command/command.js";

let readme = await fs.readFile("README.md", "utf8");

readme = readme.replace(
  /^## Usage.*?(^## )/ms,
  dedent`
    ## Usage

    \`\`\`sh-session
    $ npm install -g @gadgetinc/ggt
    $ ggt
    ${usage()}
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
    $ ggt ${name} --help
    ${cmd.usage()}
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
