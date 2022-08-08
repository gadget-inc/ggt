import { BaseCommand } from "../lib/base-command";
import { logger } from "../lib/logger";

export default class Logout extends BaseCommand {
  static override summary = "Log out of your account.";

  static override usage = "logout";

  static override examples = [
    `$ ggt logout
👋 Goodbye
`,
  ];

  // eslint-disable-next-line @typescript-eslint/require-await
  async run(): Promise<void> {
    if (this.logout()) {
      logger.info("👋 Goodbye");
    } else {
      logger.info("You are not logged in");
    }
  }
}
