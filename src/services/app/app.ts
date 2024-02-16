import assert from "node:assert";
import { z } from "zod";
import type { Context } from "../command/context.js";
import { config } from "../config/config.js";
import { loadCookie } from "../http/auth.js";
import { http } from "../http/http.js";
import { Api } from "./api/api.js";
import { GADGET_META_MODELS_QUERY } from "./api/operation.js";

export const EnvironmentType = Object.freeze({
  Development: "development",
  Production: "production",
  Test: "test",
});

export type EnvironmentType = keyof typeof EnvironmentType;

export const Environment = z.object({
  id: z.union([z.string(), z.number(), z.bigint()]).transform((v) => BigInt(v)),
  name: z.string().transform((name) => name.toLowerCase()),
  type: z.nativeEnum(EnvironmentType),
});

export type Environment = z.infer<typeof Environment>;

// TODO: rename to Application
export const App = z.object({
  id: z.union([z.string(), z.number(), z.bigint()]).transform((v) => BigInt(v)),
  slug: z.string(),
  primaryDomain: z.string(),
  hasSplitEnvironments: z.boolean(),
  multiEnvironmentEnabled: z.boolean(),
  environments: z.array(Environment),
});

export const ModelApiIdentifier = z.object({
  apiIdentifier: z.string(),
});

export type App = z.infer<typeof App>;

export type ModelApiIdentifier = z.infer<typeof ModelApiIdentifier>;

/**
 * Retrieves a list of apps for the given user. If the user is not
 * logged in, an empty array is returned instead.
 *
 * @param ctx - The current context.
 * @returns A promise that resolves to an array of App objects.
 */
// TODO: cache this
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

export const getModels = async (ctx: Context): Promise<ModelApiIdentifier[] | []> => {
  const cookie = loadCookie();
  if (!cookie) {
    return [];
  }

  assert(ctx.user, "must get user before getting models");

  const api = new Api(ctx);

  const result = await api.query({ query: GADGET_META_MODELS_QUERY });

  return z.array(ModelApiIdentifier).parse(result.gadgetMeta.models);
};
