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
  const agentsResult = await installAgentsMdScaffold({ projectRoot, force });
  switch (agentsResult) {
    case "installed":
      println({ content: sprint`{greenBright ✓} AGENTS.md installed` });
      break;
    case "skipped":
      println({ content: sprint`{gray ✓} AGENTS.md already exists (use --force to overwrite)` });
      break;
    case "failed":
      // installAgentsMdScaffold already printed the error
      break;
  }

  // 2. Install Gadget skills
  const skillsResult = await installGadgetSkillsIntoProject({ projectRoot, force });
  if (skillsResult.ok === true) {
    println({ content: sprint`{greenBright ✓} Installed skills: ${skillsResult.skillNames.join(", ")}` });
    await ensureProjectClaudeSkillSymlinks({ projectRoot, skillNames: skillsResult.skillNames });
    println({ content: sprint`{greenBright ✓} Symlinks created in .claude/skills/` });
  } else if (skillsResult.ok === "skipped") {
    println({ content: sprint`{gray ✓} Gadget skills already installed (use --force to overwrite)` });
  } else {
    println({ content: sprint`{red ✗} Failed to install skills: ${skillsResult.reason}` });
  }
};
