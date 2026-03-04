import { defineCommand } from "../services/command/command.js";
import colors from "../services/output/colors.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";
import { getUser } from "../services/user/user.js";

export default defineCommand({
  name: "whoami",
  description: "Show the current logged-in user",
  details: sprint`
    Prints the name and email of the currently authenticated user. If no session
    is active, prints a not-logged-in message. Run ${colors.hint("ggt login")} to authenticate.
  `,
  examples: ["ggt whoami"],
  run: async (ctx) => {
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
  },
});
