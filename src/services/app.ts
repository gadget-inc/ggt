import { map } from "lodash";
import { z } from "zod";
import { config } from "./config.js";
import { http, loadCookie } from "./http.js";
import type { User } from "./user.js";

export const App = z.object({
  id: z.union([z.string(), z.number(), z.bigint()]),
  slug: z.string(),
  primaryDomain: z.string(),
  hasSplitEnvironments: z.boolean(),
});

export type App = z.infer<typeof App> & { user: User };

/**
 * @returns The list of Gadget applications the current user has access to.
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

  return map(z.array(App).parse(json), (app) => ({ ...app, user }));
};
