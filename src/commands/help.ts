import { Args } from "@oclif/core";
import Help from "../services/help.js";
import { BaseCommand } from "../services/base-command.js";

/**
 * Copied from @oclif/plugin-help. Uses our own {@link Help} template class instead of the one from @oclif/core.
 *
 * @see https://github.com/oclif/plugin-help/blob/67b580570257b45e92d3a04d50bf2a432c59afe3/src/commands/help.ts
 */
export default class HelpCommand extends BaseCommand<typeof HelpCommand> {
  static override strict = false;

  static override summary = "Display help for ggt.";

  static override args = {
    command: Args.string({
      required: false,
      description: "The command to show help for.",
    }),
  };

  async run(): Promise<void> {
    const { argv } = await this.parse();
    const help = new Help(this.config, { all: true });
    await help.showHelp(argv as string[]);
  }
}
