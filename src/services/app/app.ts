import { z } from "zod";

import type { Context } from "../command/context.js";
import type { FlagsDefinition } from "../command/flag.js";
import { config } from "../config/config.js";
import { maybeLoadAuthHeaders } from "../http/auth.js";
import { http } from "../http/http.js";
import { sprint } from "../output/sprint.js";
import { Api } from "./api/api.js";
import { GADGET_GLOBAL_ACTIONS_QUERY, GADGET_META_MODELS_QUERY } from "./api/operation.js";
import { AppSlug } from "./arg.js";

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
  nodeVersion: z.string().optional(),
});

export type Environment = z.infer<typeof Environment> & {
  application: Application;
};

export const Application = z.object({
  id: z.union([z.string(), z.number(), z.bigint()]).transform((v) => BigInt(v)),
  slug: z.string(),
  primaryDomain: z.string(),
  environments: z.array(Environment),
  team: z.object({
    id: z.union([z.string(), z.number(), z.bigint()]).transform((v) => BigInt(v)),
    name: z.string(),
  }),
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
 * Flag definition for the --app flag.
 */
export const AppArg = {
  type: AppSlug,
  alias: ["-a", "--app"],
  description: "Gadget app to use",
  valueName: "app",
  details: sprint`
    The app slug is the subdomain portion of your app URL (e.g., my-app from
    my-app.gadget.app). Can be omitted when .gadget/sync.json already records
    the app.
  `,
} satisfies FlagsDefinition[string];

/**
 * Flag definition for the --env flag.
 */
export const EnvArg = {
  type: String,
  alias: ["-e", "--env"],
  description: "Environment to use",
  valueName: "env",
  details: sprint`
    Defaults to the development environment. Production is read-only for most
    commands.
  `,
} satisfies FlagsDefinition[string];

/**
 * Retrieves a list of apps for the given user. If the user is not
 * logged in, an empty array is returned instead.
 *
 * @param ctx - The current context.
 * @returns A promise that resolves to an array of Application objects.
 */
export const getApplications = async (ctx: Context): Promise<Application[]> => {
  const headers = maybeLoadAuthHeaders(ctx);
  if (!headers) {
    return [];
  }

  const json = await http({
    context: { ctx },
    url: `https://${config.domains.services}/auth/api/apps`,
    headers: { ...headers },
    responseType: "json",
    resolveBodyOnly: true,
  });

  return z.array(Application).parse(json);
};

export const groupByTeam = (apps: Application[]): Map<string, Application[]> => {
  const teamMap = new Map<string, Application[]>();
  for (const app of apps) {
    const teamName = app.team.name;
    const teamApps = teamMap.get(teamName) ?? [];
    teamApps.push(app);
    teamMap.set(teamName, teamApps);
  }
  return teamMap;
};

export const getModels = async (ctx: Context, environment: Environment): Promise<ModelApiIdentifier[] | []> => {
  const headers = maybeLoadAuthHeaders(ctx);
  if (!headers) {
    return [];
  }

  const api = new Api(ctx, environment);
  const { gadgetMeta } = await api.query({ query: GADGET_META_MODELS_QUERY });
  return gadgetMeta.models;
};

export const getGlobalActions = async (ctx: Context, environment: Environment): Promise<GlobalActionApiIdentifier[] | []> => {
  const headers = maybeLoadAuthHeaders(ctx);
  if (!headers) {
    return [];
  }

  const api = new Api(ctx, environment);
  const { gadgetMeta } = await api.query({ query: GADGET_GLOBAL_ACTIONS_QUERY });
  return gadgetMeta.globalActions;
};
