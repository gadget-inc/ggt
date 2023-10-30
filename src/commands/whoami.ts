import { println, sprint } from "../services/print.js";
import { getUser } from "../services/user.js";
import type { Command } from "./index.js";

export const usage = sprint`
    Show the name and email address of the currently logged in user.

    {bold USAGE}
      $ ggt whoami

    {bold EXAMPLES}
      {gray $ ggt whoami}
      You are logged in as Jane Doe (jane@example.com)
`;

export const command: Command = async () => {
  const user = await getUser();
  if (!user) {
    println`You are not logged in`;
    return;
  }

  if (user.name) {
    println`You are logged in as ${user.name} {gray (${user.email})}`;
  } else {
    println`You are logged in as ${user.email}`;
  }
};
