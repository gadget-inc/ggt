import dedent from "ts-dedent";
import { BaseCommand } from "../lib/base-command";
import { session } from "../lib/session";

export default class Logout extends BaseCommand {
  static override summary = "Log out of your account.";

  static override usage = "logout";

  static override examples = [
    dedent`
      $ ggt logout
      Goodbye
    `,
  ];

  // eslint-disable-next-line @typescript-eslint/require-await
  async run(): Promise<void> {
    if (session.set(undefined)) {
      this.log("Goodbye");
    } else {
      this.log("You are not logged in");
    }
  }
}
