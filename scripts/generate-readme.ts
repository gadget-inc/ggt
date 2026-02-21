#!/usr/bin/env node --loader=ts-node/esm --no-warnings

import { $ } from "execa";
import fs from "fs-extra";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkToc from "remark-toc";
import { dedent } from "ts-dedent";

import { usage } from "../src/commands/root.js";
import { Commands, importCommand } from "../src/services/command/command.js";
import { renderShortUsage } from "../src/services/command/usage.js";

let readme = await fs.readFile("README.md", "utf8");

readme = readme.replace(
  /^## Usage.*?(^## )/ms,
  dedent`
    ## Usage

    \`\`\`sh-session
    $ npm install -g ggt
    $ ggt
    ${await usage()}
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
    ${renderShortUsage(name, cmd)}
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
await $`npx oxfmt README.md`;
