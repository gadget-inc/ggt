import type { ArgsDefinition } from "../services/command/arg.js";
import type { Run, Usage } from "../services/command/command.js";
import {
  ensureProjectClaudeSkillSymlinks,
  installAgentsMdScaffold,
  installGadgetSkillsIntoProject,
} from "../services/output/agent-plugin.js";
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
  const subcommand = args._[0];
  if (subcommand !== "install") {
    println(usage(_ctx));
    return;
  }

  const projectRoot = process.cwd();
  const force = args["--force"] ?? false;

  // 1. Install AGENTS.md scaffolding
  println({ content: sprint`Installing {cyanBright AGENTS.md} scaffolding...` });
  const agentsOk = await installAgentsMdScaffold({ projectRoot, force });
  if (agentsOk) {
    println({ content: sprint`{greenBright ✓} AGENTS.md installed` });
  }

  // 2. Install Gadget skills
  println({ content: sprint`Installing Gadget agent skills...` });
  const result = await installGadgetSkillsIntoProject({ projectRoot });
  if (result.ok) {
    println({ content: sprint`{greenBright ✓} Installed skills: ${result.skillNames.join(", ")}` });
    await ensureProjectClaudeSkillSymlinks({ projectRoot, skillNames: result.skillNames });
    println({ content: sprint`{greenBright ✓} Symlinks created in .claude/skills/` });
  } else {
    println({ content: sprint`{red ✗} Failed to install skills: ${result.reason}` });
  }
};
