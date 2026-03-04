import path from "node:path";

import { findUp } from "find-up";
import fs from "fs-extra";

import { defineCommand } from "../services/command/command.js";
import { Directory } from "../services/filesync/directory.js";
import { installAgentsMdScaffold, installGadgetSkillsIntoProject } from "../services/output/agent-plugin.js";
import colors from "../services/output/colors.js";
import { confirm } from "../services/output/confirm.js";
import { sprint } from "../services/output/sprint.js";

const resolveProjectRoot = async (): Promise<Directory> => {
  const cwd = process.cwd();
  const syncJsonPath = await findUp(".gadget/sync.json", { cwd });
  const projectRoot = syncJsonPath ? path.dirname(path.dirname(syncJsonPath)) : cwd;
  return Directory.init(projectRoot);
};

export default defineCommand({
  name: "agent-plugin",
  description: "Manage plugins for AI coding assistants",
  details: sprint`
    Plugins include an ${colors.identifier("AGENTS.md")} scaffold at the project root and Gadget-specific
    skill files. These help tools like Claude Code and Cursor understand your Gadget
    app's conventions. Must be run from inside a Gadget project directory or its parent.
  `,
  examples: ["ggt agent-plugin install", "ggt agent-plugin install --force", "ggt agent-plugin update"],
  subcommands: (sub) => ({
    install: sub({
      description: "Install agent plugins into the current project",
      details: sprint`
        Writes ${colors.identifier("AGENTS.md")} and Gadget skill files into your project. Existing
        files are skipped unless ${colors.hint("--force")} is passed to overwrite them. The
        project root is detected from ${colors.hint(".gadget/sync.json")} or defaults to the
        current directory.
      `,
      examples: ["ggt agent-plugin install", "ggt agent-plugin install --force"],
      args: {
        "--force": {
          type: Boolean,
          alias: "-f",
          description: "Overwrite existing files even if already present",
          details: "Overwrites existing AGENTS.md and skill files. Without this flag, existing files are left untouched.",
        },
      },
      run: async (ctx, args) => {
        const directory = await resolveProjectRoot();
        const force = args["--force"] ?? false;

        await installAgentsMdScaffold({ ctx, directory, force });
        await installGadgetSkillsIntoProject({ ctx, directory, force });
      },
    }),
    update: sub({
      description: "Update agent plugins to the latest version",
      details: sprint`
        Overwrites all agent plugin files with their latest versions. Prompts
        before replacing ${colors.identifier("AGENTS.md")} if it already exists. Skill files are
        always replaced without prompting.
      `,
      examples: ["ggt agent-plugin update"],
      run: async (ctx) => {
        const directory = await resolveProjectRoot();

        const hasAgentsMd = await fs.pathExists(directory.absolute("AGENTS.md"));
        if (!hasAgentsMd || (await confirm({ exitWhenNo: false, content: "Overwrite AGENTS.md with latest version?" }))) {
          await installAgentsMdScaffold({ ctx, directory, force: true });
        }
        await installGadgetSkillsIntoProject({ ctx, directory, force: true });
      },
    }),
  }),
});
