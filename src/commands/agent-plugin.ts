import { findUp } from "find-up";
import path from "node:path";

import type { ArgsDefinition } from "../services/command/arg.js";
import type { Run, Usage } from "../services/command/command.js";

import { Directory } from "../services/filesync/directory.js";
import { installAgentsMdScaffold, installGadgetSkillsIntoProject } from "../services/output/agent-plugin.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";

export const args = {
  "--force": { type: Boolean },
} satisfies ArgsDefinition;

export const usage: Usage = () => {
  return sprint`
    Install or update Gadget agent plugins (AGENTS.md + skills).

    {gray Usage}
      ggt agent-plugin install [--force]
      ggt agent-plugin update

    {gray Flags}
      --force    Overwrite/reinstall even if already present
  `;
};

const resolveDirectory = async (): Promise<Directory> => {
  const cwd = process.cwd();
  const syncJsonPath = await findUp(".gadget/sync.json", { cwd });
  const projectRoot = syncJsonPath ? path.join(syncJsonPath, "../..") : cwd;
  return Directory.init(projectRoot);
};

export const run: Run<typeof args> = async (ctx, args): Promise<void> => {
  const subcommand = args._[0];

  if (subcommand !== "install" && subcommand !== "update") {
    println(usage(ctx));
    return;
  }

  const directory = await resolveDirectory();
  const force = subcommand === "update" || (args["--force"] ?? false);
  await installAgentsMdScaffold({ ctx, directory, force });
  await installGadgetSkillsIntoProject({ ctx, directory, force });
};
