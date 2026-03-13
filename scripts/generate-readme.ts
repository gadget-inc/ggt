#!/usr/bin/env node --experimental-transform-types --no-warnings

import { $ } from "execa";
import fs from "fs-extra";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkToc from "remark-toc";
import stripAnsi from "strip-ansi";
import { dedent } from "ts-dedent";

import { usage } from "../src/commands/root.ts";
import { Commands, importCommand } from "../src/services/command/command.ts";
import { renderShortUsage } from "../src/services/command/usage.ts";

let readme = await fs.readFile("README.md", "utf8");

readme = readme.replace(
  /^## Usage.*?(^## )/ms,
  dedent`
    ## Usage

    \`\`\`sh-session
    $ npm install -g ggt
    $ ggt
    ${stripAnsi(await usage())}
    \`\`\`

    $1
  `,
);

const commands: string[] = [];
for (const name of Commands) {
  const cmd = await importCommand(name);
  if (cmd.hidden) continue;
  commands.push(dedent`
    ### \`ggt ${name}\`

    \`\`\`sh-session
    $ ggt ${name} -h
    ${stripAnsi(renderShortUsage(name, cmd, { footer: false }))}
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
