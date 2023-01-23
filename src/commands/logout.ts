import chalk from "chalk";
import dedent from "ts-dedent";
import { BaseCommand } from "../utils/base-command";
import { context } from "../utils/context";

export default class Logout extends BaseCommand<typeof Logout> {
  static override summary = "Log out of your account.";

  static override usage = "logout";

  static override examples = [
    dedent(chalk`
      {gray $ ggt logout}
      Goodbye
    `),
  ];

  // eslint-disable-next-line @typescript-eslint/require-await
  async run(): Promise<void> {
    if (context.session) {
      context.session = undefined;
      this.log("Goodbye");
    } else {
      this.log("You are not logged in");
    }
  }
}
