import type { Run, Usage } from "../services/command/command.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";
import { getUser } from "../services/user/user.js";

export const usage: Usage = () => sprint`
    Show the name and email address of the currently logged in user.

    {gray Usage}
          ggt whoami
`;

export const run: Run = async (ctx) => {
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
