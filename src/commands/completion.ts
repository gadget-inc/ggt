import type { Run, SubcommandDef } from "../services/command/command.js";

import { ArgError } from "../services/command/arg.js";
import { renderDetailedUsage } from "../services/command/usage.js";
import {
  generateBashCompletions,
  generateFishCompletions,
  generateZshCompletions,
  getCompletionData,
} from "../services/completion/index.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";

export const description = "Generate shell completion scripts";

export const positional = "<shell>";

export const examples = ["ggt completion bash", "ggt completion zsh", "ggt completion fish"] as const;

export const subcommands = ["bash", "zsh", "fish"] as const;

export const subcommandDefs: readonly SubcommandDef[] = [
  { name: "bash", description: "Generate bash completion script" },
  { name: "zsh", description: "Generate zsh completion script" },
  { name: "fish", description: "Generate fish completion script" },
];

export const sections = [
  {
    title: "Installation",
    content: [
      "Bash (add to ~/.bashrc):",
      "  source <(ggt completion bash)",
      "",
      "Zsh (add to ~/.zshrc):",
      "  source <(ggt completion zsh)",
      "",
      "Fish:",
      "  ggt completion fish | source",
      "  # Or to persist:",
      "  ggt completion fish > ~/.config/fish/completions/ggt.fish",
    ].join("\n"),
  },
] as const;

type Shell = (typeof subcommands)[number];

const isShell = (value: string): value is Shell => {
  return subcommands.includes(value as Shell);
};

export const run: Run = async (_ctx, args): Promise<void> => {
  const shell = args._[0];

  if (!shell) {
    // Import ourselves to pass as a module to renderDetailedUsage
    const mod = await import("./completion.js");
    println(renderDetailedUsage("completion", mod));
    return;
  }

  if (!isShell(shell)) {
    throw new ArgError(sprint`Unknown shell: {yellow ${shell}}. Supported shells: bash, zsh, fish`);
  }

  const data = await getCompletionData();

  switch (shell) {
    case "bash":
      process.stdout.write(generateBashCompletions(data));
      return;
    case "zsh":
      process.stdout.write(generateZshCompletions(data));
      return;
    case "fish":
      process.stdout.write(generateFishCompletions(data));
      return;
  }
};
