import dedent from "ts-dedent";
import { BaseCommand } from "../utils/base-command";

export default class Login extends BaseCommand {
  static override summary = "Log in to your account.";

  static override usage = "login";

  static override examples = [
    dedent`
      $ ggt login
      Your browser has been opened. Please log in to your account.
      Hello, Jane Doe (jane@example.com)
    `,
  ];

  async run(): Promise<void> {
    await this.login();
  }
}
