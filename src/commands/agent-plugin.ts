import { findUp } from "find-up";
import path from "node:path";

import type { ArgsDefinition } from "../services/command/arg.js";
import type { Run, SubcommandDef } from "../services/command/command.js";

import { renderDetailedUsage } from "../services/command/usage.js";
import { Directory } from "../services/filesync/directory.js";
import { installAgentsMdScaffold, installGadgetSkillsIntoProject } from "../services/output/agent-plugin.js";
import { println } from "../services/output/print.js";

export const description = "Install Gadget agent plugins (AGENTS.md + skills)";

export const examples = ["ggt agent-plugin install", "ggt agent-plugin install --force"] as const;

const installArgs = {
  "--force": { type: Boolean, description: "Overwrite/reinstall even if already present" },
} satisfies ArgsDefinition;

export const args = {
  ...installArgs,
} satisfies ArgsDefinition;

export const subcommandDefs: readonly SubcommandDef[] = [
  { name: "install", description: "Install Gadget agent plugins into the current project", args: installArgs },
];

export const run: Run<typeof args> = async (ctx, args): Promise<void> => {
  if (args._[0] !== "install") {
    const { importCommand } = await import("../services/command/command.js");
    const mod = await importCommand("agent-plugin");
    println(renderDetailedUsage("agent-plugin", mod));
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
