import chalk from "chalk";
import dedent from "ts-dedent";
import { BaseCommand } from "../utils/base-command";
import { context } from "../utils/context";

export default class Whoami extends BaseCommand {
  static override summary = "Show the name and email address of the currently logged in user.";

  static override usage = "whoami";

  static override examples = [
    dedent(chalk`
      {gray $ ggt whoami}
      You are logged in as Jane Doe {gray (jane@example.com)}
    `),
  ];

  async run(): Promise<void> {
    const user = await context.getUser();
    if (!user) {
      this.log("You are not logged in");
      return;
    }

    if (user.name) {
      this.log(chalk`You are logged in as ${user.name} {gray (${user.email})}`);
    } else {
      this.log(`You are logged in as ${user.email}`);
    }
  }
}
