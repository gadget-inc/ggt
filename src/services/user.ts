import inquirer from "inquirer";
import _ from "lodash";
import assert from "node:assert";
import z from "zod";
import { run as login } from "../commands/login.js";
import { config } from "./config.js";
import { setUser } from "./errors.js";
import { http, loadCookie, swallowUnauthorized } from "./http.js";
import { createLogger } from "./log.js";

const log = createLogger("user");

const User = z.object({
  id: z.union([z.string(), z.number()]).transform(Number),
  name: z.string().nullish(),
  email: z.string(),
});

export type User = z.infer<typeof User>;

/**
 * @returns The current user.
 */
export const getUser = async (): Promise<User | undefined> => {
  const cookie = loadCookie();
  if (!cookie) {
    return undefined;
  }

  try {
    const json = await http({
      url: `https://${config.domains.services}/auth/api/current-user`,
      headers: { cookie },
      responseType: "json",
      resolveBodyOnly: true,
    });

    const user = User.parse(json);
    setUser(user);
    log.info("loaded current user", { user: _.pick(user, ["id", "name", "email"]) });

    return user;
  } catch (error) {
    swallowUnauthorized(error);
    return undefined;
  }
};

export const getUserOrLogin = async (message = "You must be logged in to use this command. Would you like to log in?"): Promise<User> => {
  let user = await getUser();
  if (user) {
    return user;
  }

  log.info("prompting user to log in");
  const { yes } = await inquirer.prompt<{ yes: boolean }>({
    type: "confirm",
    name: "yes",
    message,
  });

  if (!yes) {
    process.exit(0);
  }

  await login();

  user = await getUser();
  assert(user, "missing user after successful login");

  return user;
};
