import chalkTemplate from "chalk-template";
import { dedent } from "ts-dedent";
import { BaseCommand } from "../services/base-command.js";
import { context } from "../services/context.js";

export default class Whoami extends BaseCommand<typeof Whoami> {
  static override summary = "Show the name and email address of the currently logged in user.";

  static override usage = "whoami";

  static override examples = [
    dedent(chalkTemplate`
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
      this.log(chalkTemplate`You are logged in as ${user.name} {gray (${user.email})}`);
    } else {
      this.log(`You are logged in as ${user.email}`);
    }
  }
}
