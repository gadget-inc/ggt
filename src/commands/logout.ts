import type { Context } from "../services/context.js";
import { println, sprint } from "../services/output.js";

export const usage = sprint`
    Log out of your account.

    {bold USAGE}
      $ ggt logout

    {bold EXAMPLES}
      {gray $ ggt logout}
      Goodbye
`;

export const run = (ctx: Context) => {
  if (ctx.session) {
    ctx.session = undefined;
    println`Goodbye`;
  } else {
    println`You are not logged in`;
  }
};
