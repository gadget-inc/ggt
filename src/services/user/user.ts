import assert from "node:assert";
import z from "zod";
import { login } from "../../commands/login.js";
import { config } from "../config/config.js";
import { loadCookie, swallowUnauthorized } from "../http/auth.js";
import { http } from "../http/http.js";
import { createLogger } from "../output/log/logger.js";
import { confirm } from "../output/prompt.js";
import { setUser } from "../output/report.js";
import { pick } from "../util/object.js";

const log = createLogger({ name: "user" });

const User = z.object({
  id: z.union([z.string(), z.number()]).transform(Number),
  name: z.string().nullish(),
  email: z.string(),
});

export type User = z.infer<typeof User>;

/**
 * Retrieves the currently logged in user from Gadgets API.
 *
 * @returns A Promise that resolves to a User object representing the
 * current user, or undefined if the user is not authenticated.
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
    log.info("loaded current user", { user: pick(user, ["id", "name", "email"]) });

    return user;
  } catch (error) {
    swallowUnauthorized(error);
    return undefined;
  }
};

/**
 * Retrieves the current user or prompts the user to log in if not
 * already logged in.
 *
 * @param message - The message to display when prompting the user to log in.
 * @returns A Promise that resolves to the current user.
 */
export const getUserOrLogin = async (message = "You must be logged in to use this command. Would you like to log in?"): Promise<User> => {
  let user = await getUser();
  if (user) {
    return user;
  }

  log.info("prompting user to log in");
  await confirm({ message });

  await login();

  user = await getUser();
  assert(user, "missing user after successful login");

  return user;
};
