import assert from "node:assert";
import { z } from "zod";
import type { Context } from "../command/context.js";
import { config } from "../config/config.js";
import { loadCookie } from "../http/auth.js";
import { http } from "../http/http.js";

export const App = z.object({
  id: z.union([z.string(), z.number(), z.bigint()]),
  slug: z.string(),
  primaryDomain: z.string(),
  hasSplitEnvironments: z.boolean(),
});

export type App = z.infer<typeof App>;

/**
 * Retrieves a list of apps for the given user. If the user is not
 * logged in, an empty array is returned instead.
 *
 * @param ctx - The current context.
 * @returns A promise that resolves to an array of App objects.
 */
export const getApps = async (ctx: Context): Promise<App[]> => {
  const cookie = loadCookie();
  if (!cookie) {
    return [];
  }

  assert(ctx.user, "must get user before getting apps");

  const json = await http({
    context: { ctx },
    url: `https://${config.domains.services}/auth/api/apps`,
    headers: { cookie },
    responseType: "json",
    resolveBodyOnly: true,
  });

  return z.array(App).parse(json);
};
