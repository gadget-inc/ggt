import type { Run } from "../services/command/command.js";

import { println } from "../services/output/print.js";
import { readSession, writeSession } from "../services/user/session.js";

export const description = "Log out of your account";

export const examples = ["ggt logout"] as const;

export const run: Run = (ctx) => {
  const token = readSession(ctx);
  if (token) {
    writeSession(ctx, undefined);
    println("Goodbye");
  } else {
    println("You are not logged in");
  }
};
