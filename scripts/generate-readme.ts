#!/usr/bin/env FORCE_COLOR=0 node --no-warnings --loader ts-node/esm

import { $ } from "execa";
import fs from "fs-extra";
import _ from "lodash";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkToc from "remark-toc";
import { dedent } from "ts-dedent";
import { availableCommands, type Command } from "../src/commands/index.js";
import { usage } from "../src/commands/root.js";

let readme = await fs.readFile("README.md", "utf-8");

readme = _.replace(
  readme,
  /^## Usage.*?(^## )/ms,
  dedent`
    ## Usage

    \`\`\`sh-session
    $ npm install -g @gadgetinc/ggt
    $ ggt
    ${usage}
    \`\`\`

    $1
  `,
);

const commands: string[] = [];
for (const name of availableCommands) {
  const command: Command = await import(`../src/commands/${name}.js`);
  commands.push(dedent`
    ### \`ggt ${name}\`

    \`\`\`
    ${command.usage}
    \`\`\`
  `);
}

readme = _.replace(
  readme,
  /## Commands.*$/s,
  dedent`
    ## Commands

    ${commands.join("\n\n")}
  `,
);

const file = await remark().use(remarkGfm).use(remarkToc, { tight: true }).process(readme);
await fs.writeFile("README.md", String(file));
await $`npx prettier -w README.md`;
