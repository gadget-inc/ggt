import { context } from "../services/context.js";
import { println, sprint } from "../services/output.js";

export const usage = sprint`
    Log out of your account.

    {bold USAGE}
      $ ggt logout

    {bold EXAMPLES}
      {gray $ ggt logout}
      Goodbye
`;

export const run = () => {
  if (context.session) {
    context.session = undefined;
    println`Goodbye`;
  } else {
    println`You are not logged in`;
  }
};
