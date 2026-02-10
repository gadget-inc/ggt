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
    Install Gadget agent plugins (AGENTS.md + skills) into the current project.

    {gray Usage}
      ggt agent-plugin install [--force]

    {gray Flags}
      --force    Overwrite/reinstall even if already present
  `;
};

export const run: Run<typeof args> = async (ctx, args): Promise<void> => {
  if (args._[0] !== "install") {
    println(usage(ctx));
    return;
  }

  const cwd = process.cwd();
  const syncJsonPath = await findUp(".gadget/sync.json", { cwd });
  const projectRoot = syncJsonPath ? path.join(syncJsonPath, "../..") : cwd;
  const directory = await Directory.init(projectRoot);
  const force = args["--force"] ?? false;

  await installAgentsMdScaffold({ ctx, directory, force });
  await installGadgetSkillsIntoProject({ ctx, directory, force });
};
