import dedent from "dedent";
import { BaseCommand } from "../lib/base-command";

export default class Whoami extends BaseCommand {
  static override summary = "Show the name and email address of the currently logged in user.";

  static override usage = "whoami";

  static override examples = [
    dedent`
      $ ggt whoami
      You are logged in as Jane Doe (jane@example.com)
    `,
  ];

  async run(): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) {
      this.log("You are not logged in");
      return;
    }

    if (user.name) {
      this.log(`You are logged in as ${user.name} (${user.email})`);
    } else {
      this.log(`You are logged in as ${user.email}`);
    }
  }
}
