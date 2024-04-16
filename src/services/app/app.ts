import assert from "node:assert";
import { z } from "zod";
import type { Context } from "../command/context.js";
import { config } from "../config/config.js";
import { loadAuthHeaders } from "../http/auth.js";
import { http } from "../http/http.js";
import { Api } from "./api/api.js";
import { GADGET_GLOBAL_ACTIONS_QUERY, GADGET_META_MODELS_QUERY } from "./api/operation.js";

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

export const Application = z.object({
  id: z.union([z.string(), z.number(), z.bigint()]).transform((v) => BigInt(v)),
  slug: z.string(),
  primaryDomain: z.string(),
  hasSplitEnvironments: z.boolean(),
  multiEnvironmentEnabled: z.boolean(),
  environments: z.array(Environment),
});

export type Application = z.infer<typeof Application>;

export const ModelApiIdentifier = z.object({
  apiIdentifier: z.string(),
  namespace: z.nullable(z.array(z.string())).optional(),
});

export type ModelApiIdentifier = z.infer<typeof ModelApiIdentifier>;

export const GlobalActionApiIdentifier = z.object({
  apiIdentifier: z.string(),
  namespace: z.nullable(z.array(z.string())).optional(),
});

export type GlobalActionApiIdentifier = z.infer<typeof GlobalActionApiIdentifier>;

/**
 * Retrieves a list of apps for the given user. If the user is not
 * logged in, an empty array is returned instead.
 *
 * @param ctx - The current context.
 * @returns A promise that resolves to an array of Application objects.
 */
// TODO: cache this
export const getApps = async (ctx: Context): Promise<Application[]> => {
  const headers = loadAuthHeaders();
  if (!headers) {
    return [];
  }

  assert(ctx.user, "must get user before getting apps");

  const json = await http({
    context: { ctx },
    url: `https://${config.domains.services}/auth/api/apps`,
    headers: { ...headers },
    responseType: "json",
    resolveBodyOnly: true,
  });

  return z.array(Application).parse(json);
};

export const getModels = async (ctx: Context): Promise<ModelApiIdentifier[] | []> => {
  const headers = loadAuthHeaders();
  if (!headers) {
    return [];
  }

  assert(ctx.user, "must get user before getting models");

  const api = new Api(ctx);
  const { gadgetMeta } = await api.query({ query: GADGET_META_MODELS_QUERY });
  return gadgetMeta.models;
};

export const getGlobalActions = async (ctx: Context): Promise<GlobalActionApiIdentifier[] | []> => {
  const headers = loadAuthHeaders();
  if (!headers) {
    return [];
  }

  assert(ctx.user, "must get user before getting models");

  const api = new Api(ctx);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { gadgetMeta } = await api.query({ query: GADGET_GLOBAL_ACTIONS_QUERY });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  return gadgetMeta.globalActions;
};
