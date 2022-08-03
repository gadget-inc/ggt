import { BaseCommand } from "../lib/base-command";
import { Config } from "../lib/config";
import { logger } from "../lib/logger";

// eslint-disable-next-line jsdoc/require-jsdoc
export default class Logout extends BaseCommand {
  static override summary = "Log out of your account.";

  static override usage = "logout";

  static override examples = [
    `$ ggt logout
👋 goodbye!
`,
  ];

  // eslint-disable-next-line @typescript-eslint/require-await
  async run(): Promise<void> {
    if (!Config.session) {
      logger.info("You are not logged in");
      return;
    }

    Config.session = undefined;
    Config.save();
    logger.info("👋 goodbye!");
  }
}
