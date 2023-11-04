import { z } from "zod";
import { config } from "../config.js";
import { http, loadCookie } from "../http.js";
import type { User } from "../user.js";

export const App = z.object({
  id: z.union([z.string(), z.number(), z.bigint()]),
  slug: z.string(),
  primaryDomain: z.string(),
  hasSplitEnvironments: z.boolean(),
});

export type App = z.infer<typeof App> & { user: User };

/**
 * Retrieves a list of apps for the given user. If the user is not
 * logged in, an empty array is returned instead.
 *
 * @param user The user for whom to retrieve the apps.
 * @returns A promise that resolves to an array of App objects.
 */
export const getApps = async (user: User): Promise<App[]> => {
  const cookie = loadCookie();
  if (!cookie) {
    return [];
  }

  const json = await http({
    url: `https://${config.domains.services}/auth/api/apps`,
    headers: { cookie },
    responseType: "json",
    resolveBodyOnly: true,
  });

  return z
    .array(App)
    .parse(json)
    .map((app) => ({ ...app, user }));
};
