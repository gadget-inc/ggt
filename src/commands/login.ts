import chalkTemplate from "chalk-template";
import { dedent } from "ts-dedent";
import { BaseCommand } from "../services/base-command.js";

export default class Login extends BaseCommand<typeof Login> {
  static override summary = "Log in to your account.";

  static override usage = "login";

  static override examples = [
    dedent(chalkTemplate`
      {gray $ ggt login}
      We've opened Gadget's login page using your default browser.

      Please log in and then return to this terminal.

      Hello, Jane Doe {gray (jane@example.com)}
    `),
  ];

  async run(): Promise<void> {
    await this.login();
  }
}
