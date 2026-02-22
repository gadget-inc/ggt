import type { Run } from "../services/command/command.js";

import { println } from "../services/output/print.js";
import { getUser } from "../services/user/user.js";

export const description = "Print the name and email of the logged-in user";

export const examples = ["ggt whoami"] as const;

export const run: Run = async (ctx) => {
  const user = await getUser(ctx);
  if (!user) {
    println("You are not logged in");
    return;
  }

  if (user.name) {
    println(`You are logged in as ${user.name} (${user.email})`);
  } else {
    println(`You are logged in as ${user.email}`);
  }
};
