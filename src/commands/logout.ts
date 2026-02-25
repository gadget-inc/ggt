import type { Run, Usage } from "../services/command/command.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";
import { readSession, writeSession } from "../services/user/session.js";

export const usage: Usage = () => sprint`
    Log out of your account.

    {bold Usage}
          ggt logout
`;

export const run: Run = (ctx) => {
  const token = readSession(ctx);
  if (token) {
    writeSession(ctx, undefined);
    println("Goodbye");
  } else {
    println("You are not logged in");
  }
};
