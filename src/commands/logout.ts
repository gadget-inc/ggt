import { defineCommand } from "../services/command/command.ts";
import { println } from "../services/output/print.ts";
import { sprint } from "../services/output/sprint.ts";
import { readSession, writeSession } from "../services/user/session.ts";

export default defineCommand({
  name: "logout",
  description: "Log out of Gadget",
  details: sprint`
    Clears the locally stored session token. Has no effect if you are not
    currently logged in.
  `,
  examples: ["ggt logout"],
  run: (ctx) => {
    const token = readSession(ctx);
    if (token) {
      writeSession(ctx, undefined);
      println("Goodbye");
    } else {
      println("You are not logged in");
    }
  },
});
