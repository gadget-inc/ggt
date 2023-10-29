import { println, sprint } from "../services/print.js";
import { readSession, writeSession } from "../services/session.js";

export const usage = sprint`
    Log out of your account.

    {bold USAGE}
      $ ggt logout

    {bold EXAMPLES}
      {gray $ ggt logout}
      Goodbye
`;

export const run = () => {
  const token = readSession();
  if (token) {
    writeSession(undefined);
    println`Goodbye`;
  } else {
    println`You are not logged in`;
  }
};
