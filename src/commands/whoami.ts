import { Api } from "../lib/api";
import { BaseCommand } from "../lib/base-command";
import { logger } from "../lib/logger";

// eslint-disable-next-line jsdoc/require-jsdoc
export default class Whoami extends BaseCommand {
  static override summary = "Show the name and email address of the currently logged in user.";

  static override usage = "whoami";

  static override examples = [
    `$ ggt whoami
You are logged in as Jane Doe (jane@example.com)
`,
  ];

  async run(): Promise<void> {
    const user = await Api.getCurrentUser();
    if (!user) {
      logger.info("You are not logged in");
      return;
    }

    if (user.name) {
      logger.info(`You are logged in as ${user.name} (${user.email})`);
    } else {
      logger.info(`You are logged in as ${user.email}`);
    }
  }
}
