import type { Command, Usage } from "../services/command/command.js";
import { createLogger } from "../services/output/log/logger.js";
import { sprint } from "../services/output/sprint.js";
import { getUser } from "../services/user/user.js";

const log = createLogger({ name: "whoami" });

export const usage: Usage = () => sprint`
    Show the name and email address of the currently logged in user

    {bold USAGE}
      ggt whoami

    {bold EXAMPLES}
      $ ggt whoami
        You are logged in as Jane Doe (jane@example.com)
`;

export const command: Command = async () => {
  const user = await getUser();
  if (!user) {
    log.println`You are not logged in`;
    return;
  }

  if (user.name) {
    log.println`You are logged in as ${user.name} {gray (${user.email})}`;
  } else {
    log.println`You are logged in as ${user.email}`;
  }
};
