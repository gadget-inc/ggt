import assert from "node:assert";
import { z } from "zod";
import { login } from "../../commands/login.js";
import type { Command } from "../command/command.js";
import type { Context } from "../command/context.js";
import { config } from "../config/config.js";
import { maybeLoadAuthHeaders, swallowUnauthorized } from "../http/auth.js";
import { http } from "../http/http.js";
import { confirm } from "../output/confirm.js";
import { println } from "../output/print.js";
import { setSentryUser } from "../output/sentry.js";

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
export const getUser = async (ctx: Context): Promise<User | undefined> => {
  const headers = maybeLoadAuthHeaders(ctx);
  if (!headers) {
    return undefined;
  }

  try {
    const json = await http({
      context: { ctx },
      url: `https://${config.domains.services}/auth/api/current-user`,
      headers,
      responseType: "json",
      resolveBodyOnly: true,
    });

    const user = User.parse(json);
    ctx.log.info("loaded user", { user: { id: user.id } }, { user });

    setSentryUser(user);

    return user;
  } catch (error) {
    swallowUnauthorized(ctx, error);
    return undefined;
  }
};

/**
 * Retrieves the current user or prompts the user to log in if not
 * already logged in.
 *
 * @param ctx - The current context.
 * @returns A Promise that resolves to the current user.
 */
export const getUserOrLogin = async (ctx: Context, command: Command): Promise<User> => {
  let user = await getUser(ctx);
  if (user) {
    return user;
  }

  ctx.log.info("prompting user to log in");
  println({
    ensureEmptyLineAbove: true,
    content: `You must be logged in to use "ggt ${command}".`,
  });

  await confirm({ ensureEmptyLineAbove: true, content: "Would you like to log in?" });
  await login(ctx, { _: [] });

  user = await getUser(ctx);
  assert(user, "missing user after successful login");

  return user;
};
