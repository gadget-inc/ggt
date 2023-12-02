#!/usr/bin/env FORCE_COLOR=0 node --loader @swc-node/register/esm --no-warnings

import { $ } from "execa";
import fs from "fs-extra";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkToc from "remark-toc";
import { dedent } from "ts-dedent";
import { usage } from "../src/commands/root.js";
import { AvailableCommands, type CommandModule } from "../src/services/command/command.js";

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
for (const name of AvailableCommands) {
  const command = (await import(`../src/commands/${name}.js`)) as CommandModule;
  commands.push(dedent`
    ### \`ggt ${name}\`

    \`\`\`
    ${command.usage()}
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
