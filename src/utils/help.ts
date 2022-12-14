import { CommandHelp as OclifCommandHelp, Help as OclifHelp } from "@oclif/core";
import type { Example } from "@oclif/core/lib/interfaces";
import { isString } from "lodash";

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

  /**
   * Same as above, but for examples.
   */
  protected override examples(examples: string | string[] | Example[] | undefined): string | undefined {
    if (isString(examples)) {
      return examples;
    }
    if (Array.isArray(examples) && examples.every(isString)) {
      return examples.join("\n\n");
    }
    return super.examples(examples);
  }
}
