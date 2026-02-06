import type { ArgsDefinition } from "../services/command/arg.js";
import type { Run, Usage } from "../services/command/command.js";
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

export const run: Run<typeof args> = async (_ctx, args): Promise<void> => {
  if (args._[0] !== "install") {
    println(usage(_ctx));
    return;
  }

  const projectRoot = process.cwd();
  const force = args["--force"] ?? false;

  await installAgentsMdScaffold({ projectRoot, force });
  await installGadgetSkillsIntoProject({ projectRoot, force });
};
