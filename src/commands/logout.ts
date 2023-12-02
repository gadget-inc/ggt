import type { Command, Usage } from "../services/command/command.js";
import { createLogger } from "../services/output/log/logger.js";
import { sprint } from "../services/output/sprint.js";
import { readSession, writeSession } from "../services/user/session.js";

const log = createLogger({ name: "logout" });

export const usage: Usage = () => sprint`
    Log out of your account.

    {bold USAGE}
      ggt logout

    {bold EXAMPLES}
      $ ggt logout
        Goodbye
`;

export const command: Command = () => {
  const token = readSession();
  if (token) {
    writeSession(undefined);
    log.println("Goodbye");
  } else {
    log.println("You are not logged in");
  }
};
