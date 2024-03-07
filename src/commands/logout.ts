import type { Command, Usage } from "../services/command/command.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";
import { readSession, writeSession } from "../services/user/session.js";

export const usage: Usage = () => sprint`
    Log out of your account.

    {bold USAGE}
      ggt logout

    {bold EXAMPLES}
      $ ggt logout
`;

export const command: Command = (_ctx) => {
  const token = readSession();
  if (token) {
    writeSession(undefined);
    println("Goodbye");
  } else {
    println("You are not logged in");
  }
};
