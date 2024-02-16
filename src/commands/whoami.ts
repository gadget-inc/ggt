import type { Command, Usage } from "../services/command/command.js";
import { println, sprint } from "../services/output/print.js";
import { getUser } from "../services/user/user.js";

export const usage: Usage = () => sprint`
    Show the name and email address of the currently logged in user.

    {bold USAGE}
      ggt whoami

    {bold EXAMPLES}
      $ ggt whoami
`;

export const command: Command = async (ctx) => {
  const user = await getUser(ctx);
  if (!user) {
    println`You are not logged in`;
    return;
  }

  if (user.name) {
    println`You are logged in as ${user.name} (${user.email})`;
  } else {
    println`You are logged in as ${user.email}`;
  }
};
