import inquirer from "inquirer";
import assert from "node:assert";
import z from "zod";
import { run as login } from "../commands/login.js";
import { breadcrumb } from "./breadcrumbs.js";
import { config } from "./config.js";
import { setUser } from "./errors.js";
import { http, loadCookie, swallowUnauthorized } from "./http.js";

const User = z.object({
  id: z.union([z.string(), z.number()]).transform(Number),
  name: z.string().nullish(),
  email: z.string(),
});

export type User = z.infer<typeof User>;

/**
 * @returns The current user.
 */
export const loadUser = async (): Promise<User | undefined> => {
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

    breadcrumb({
      type: "info",
      category: "user",
      message: "Loaded current user",
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
    });

    return user;
  } catch (error) {
    swallowUnauthorized(error);
    return undefined;
  }
};

export const loadUserOrLogin = async (message = "You must be logged in to use this command. Would you like to log in?"): Promise<User> => {
  let user = await loadUser();
  if (user) {
    return user;
  }

  breadcrumb({
    type: "info",
    category: "user",
    message: "Prompting user to log in",
  });

  const { yes } = await inquirer.prompt<{ yes: boolean }>({
    type: "confirm",
    name: "yes",
    message,
  });

  if (!yes) {
    process.exit(0);
  }

  await login();

  user = await loadUser();
  assert(user, "missing user after successful login");

  return user;
};
