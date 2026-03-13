import { defineCommand } from "../services/command/command.ts";
import { generateBashCompletions } from "../services/completion/bash.ts";
import { getCompletionData } from "../services/completion/completions.ts";
import { generateFishCompletions } from "../services/completion/fish.ts";
import { generateZshCompletions } from "../services/completion/zsh.ts";
import colors from "../services/output/colors.ts";
import { sprint } from "../services/output/sprint.ts";

export default defineCommand({
  name: "completion",
  description: "Generate shell completion scripts",
  details: sprint`
    Generates a completion script for your shell so that ggt commands,
    subcommands, and flags are suggested when you press Tab. Run one of the
    subcommands below and follow the installation instructions to enable it.
  `,
  examples: ["ggt completion bash", "ggt completion zsh", "ggt completion fish"],
  sections: [
    {
      title: "Setup",
      content: sprint`
        Choose the section that matches your shell. After following the steps,
        open a new terminal (or reload your shell config) for completions to
        take effect. Re-run the generation command after updating ggt.

        If ggt is not installed globally, you can use ${colors.identifier("npx ggt")} in place
        of ${colors.identifier("ggt")} in the commands below.

        Bash
          ${colors.identifier("mkdir -p ~/.local/share/ggt")}
          ${colors.identifier("ggt completion bash > ~/.local/share/ggt/completion.bash")}

          Then add this line to your ${colors.identifier("~/.bashrc")} (or ${colors.identifier("~/.bash_profile")} on macOS):
            ${colors.identifier('source "$HOME/.local/share/ggt/completion.bash"')}

        Zsh
          ${colors.identifier("mkdir -p ~/.local/share/ggt")}
          ${colors.identifier("ggt completion zsh > ~/.local/share/ggt/completion.zsh")}

          Then add this line to your ${colors.identifier("~/.zshrc")}:
            ${colors.identifier('source "$HOME/.local/share/ggt/completion.zsh"')}

          If you get "command not found: compdef", add this before the line above:
            ${colors.identifier("autoload -Uz compinit && compinit")}

        Fish
          ${colors.identifier("ggt completion fish > ~/.config/fish/completions/ggt.fish")}
      `,
    },
  ],
  subcommands: (sub) => ({
    bash: sub({
      description: "Generate bash completion script",
      run: async () => {
        const data = await getCompletionData();
        process.stdout.write(generateBashCompletions(data));
      },
    }),
    zsh: sub({
      description: "Generate zsh completion script",
      run: async () => {
        const data = await getCompletionData();
        process.stdout.write(generateZshCompletions(data));
      },
    }),
    fish: sub({
      description: "Generate fish completion script",
      run: async () => {
        const data = await getCompletionData();
        process.stdout.write(generateFishCompletions(data));
      },
    }),
  }),
});
