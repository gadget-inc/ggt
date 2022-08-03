import { Api } from "../lib/api";
import { BaseCommand } from "../lib/base-command";

// eslint-disable-next-line jsdoc/require-jsdoc
export default class Login extends BaseCommand {
  static override summary = "Log in to your account.";

  static override usage = "login";

  static override examples = [
    `$ ggt login
Your browser has been opened. Please log in to your account.
👋 Hello, Jane Doe (jane@example.com)
`,
  ];

  async run(): Promise<void> {
    await Api.login();
  }
}
