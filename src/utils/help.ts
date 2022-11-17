import { CommandHelp as OclifCommandHelp, Help as OclifHelp } from "@oclif/core";

export default class Help extends OclifHelp {
  override CommandHelpClass = CommandHelp;
}

class CommandHelp extends OclifCommandHelp {
  /**
   * By default, oclif tries to format the description so that it fit's within the terminal window. However, if the description is already
   * formatted with `dedent`, then the description gets mangled and the help output is not pretty.
   *
   * This overrides the default behavior to just use the description as-is if it already exists.
   */
  protected override description(): string | undefined {
    if (this.command.description) {
      return this.command.description;
    }
    return super.description();
  }
}
